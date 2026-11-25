"""行銷案件生命跡象觀測中心：後端。

Excel 是資料來源，網站只負責匯入、判讀、呈現，以及保存站上才有的東西（評語、母子案連結、自訂欄位）。
"""
import json
import os
import re
import tempfile
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from . import auth, commentary, diffing, excel_creatives, excel_team, snapshot, store

FRONT = Path(__file__).resolve().parents[2] / "frontend"
app = FastAPI(title="case-vitals")
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SECRET_KEY", "dev-only-change-me"),
                   max_age=60 * 60 * 24 * 14, same_site="lax", https_only=os.environ.get("HTTPS_ONLY") == "1")
app.mount("/static", StaticFiles(directory=FRONT), name="static")
store.init()
auth.ensure_admin()
progress = {"running": False, "done": 0, "seen": 0, "total": 0, "error": ""}


# ---------- 頁面 ----------
@app.get("/")
def index(request: Request):
    if not request.session.get("user"):
        return RedirectResponse("/login")
    return FileResponse(FRONT / "index.html")


@app.get("/login")
def login_page():
    return FileResponse(FRONT / "login.html")


@app.post("/api/login")
async def login(request: Request):
    body = await request.json()
    with store.session() as s:
        u = s.scalars(select(store.User).where(store.User.username == body.get("username", ""))).first()
        if not u or not auth.check_password(body.get("password", ""), u.pw_hash):
            raise HTTPException(401, "帳號或密碼不對")
        request.session["user"] = {"name": u.username, "role": u.role}
    return {"ok": True}


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


# ---------- 讀取 ----------
def with_ids(s, snap):
    ids = {r.key: r.display for r in s.scalars(select(store.CaseId))}
    for c in snap["cases"]:
        c["id"] = c.get("id") or ids.get(c["key"], "")
    return snap


def _public(snap):
    for c in snap["cases"]:
        c.pop("key", None)
        c.pop("legacy", None)
    return snap


def _public_diff(d):
    """給前端的差異：拿掉內部指紋，只留案號。"""
    out = {"counts": d.get("counts", {})}
    for k in ("new", "closed", "reopened", "status", "extended", "missing"):
        out[k] = [{kk: vv for kk, vv in c.items() if kk != "key"} for c in d.get(k, [])]
    return out


@app.get("/api/bootstrap")
def bootstrap(user=Depends(auth.current)):
    with store.session() as s:
        runs = list(s.scalars(select(store.Run).where(store.Run.status == "applied").order_by(store.Run.id.desc()).limit(2)))
        run = runs[0] if runs else None
        out = {"role": user["role"], "user": user["name"], "db": None, "cm": store.kv_get(s, "cm", {}),
               "ov": store.kv_get(s, "ov", {}), "lastRun": None, "prev": None, "diff": None}
        if run:
            snap = _public(with_ids(s, store.unpack(run.snapshot)))
            if len(runs) > 1:  # 上一次匯入：前端用它算「和上次相比」
                out["prev"] = _public(with_ids(s, store.unpack(runs[1].snapshot)))
                out["diff"] = _public_diff(json.loads(run.diff))
            out.update(db=snap, today=snap["today"], planners=snap["planners"],
                       lastRun={"id": run.id, "at": run.created_at.isoformat() + "Z", "by": run.by,
                                "counts": json.loads(run.diff).get("counts", {})})
        return out


# ---------- 儲存站上的設定 ----------
@app.put("/api/state")
async def save_state(request: Request, user=Depends(auth.admin)):
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400, "格式不對")
    with store.session() as s:
        store.kv_set(s, "ov", body)
        s.commit()
    return {"ok": True}


@app.post("/api/seed")
async def seed(request: Request, user=Depends(auth.admin)):
    """一次性匯入設定檔：{"cm": {案號: 評語}, "ov": {案號: {...}}}，和現有的合併。"""
    body = await request.json()
    with store.session() as s:
        cm, ov = store.kv_get(s, "cm", {}), store.kv_get(s, "ov", {})
        cm.update({k: v for k, v in (body.get("cm") or {}).items() if isinstance(v, str)})
        for k, v in (body.get("ov") or {}).items():
            if isinstance(v, dict) and isinstance(ov.get(k), dict):
                ov[k].update(v)
            else:
                ov[k] = v
        store.kv_set(s, "cm", cm)
        store.kv_set(s, "ov", ov)
        s.commit()
        return {"ok": True, "comments": len(cm)}


# ---------- 匯入 Excel ----------
async def _save(upload):
    if upload is None or not upload.filename:
        return None
    if not upload.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, f"{upload.filename} 不是 Excel 檔")
    f = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    f.write(await upload.read())
    f.close()
    return f.name


def _by_key(snap):
    return {c["key"]: c for c in snap["cases"]} if snap else {}


@app.post("/api/import/preview")
async def import_preview(team: UploadFile = File(None), creatives: UploadFile = File(None), as_of: str = Form(""),
                         user=Depends(auth.admin)):
    paths = [await _save(team), await _save(creatives)]
    try:
        with store.session() as s:
            last = store.latest_run(s)
            team_raw = excel_team.parse(paths[0]) if paths[0] else (store.unpack(last.team_raw) if last else None)
            if team_raw is None:
                raise HTTPException(400, "第一次匯入需要企劃週追蹤表")
            if not team_raw["planners"]:
                raise HTTPException(400, "企劃週追蹤表裡找不到每週一欄的工作表，請確認有沒有傳錯檔案")
            if as_of and not re.match(r"^\d{4}-\d\d-\d\d$", as_of):
                raise HTTPException(400, "基準日格式要是 YYYY-MM-DD")
            year = int((as_of or max(p["weeks"][0] for p in team_raw["planners"] if p["weeks"]))[:4])
            make_raw = (excel_creatives.parse(paths[1], year) if paths[1]
                        else (store.unpack(last.creatives_raw) if last else None))
            if make_raw is None:
                raise HTTPException(400, "第一次匯入需要製作需求總表")
            snap = snapshot.build(team_raw, make_raw, as_of or None)
            old = _by_key(with_ids(s, store.unpack(last.snapshot))) if last else {}
            new = _by_key(snap)
            auto = diffing.auto_aliases(old, new)
            d = diffing.diff(old, new, auto)
            run = store.Run(by=user["name"], as_of=snap["today"] or "",
                            files=json.dumps({"team": team.filename if paths[0] else "", "creatives": creatives.filename if paths[1] else ""}, ensure_ascii=False),
                            team_raw=store.pack(team_raw), creatives_raw=store.pack(make_raw),
                            snapshot=store.pack(snap), diff=json.dumps({"auto": auto}, ensure_ascii=False))
            s.add(run)
            s.commit()
            trimmed = {k: (v[:60] if isinstance(v, list) else v) for k, v in d.items()}
            return {"run": run.id, "first": last is None, "as_of": snap["today"], "planners": snap["planners"],
                    "diff": trimmed, "suggestions": diffing.suggest_aliases(old, new, auto) if last else []}
    finally:
        for p in paths:
            if p:
                os.unlink(p)


@app.post("/api/import/apply/{run_id}")
async def import_apply(run_id: int, request: Request, user=Depends(auth.admin)):
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    with store.session() as s:
        run = s.get(store.Run, run_id)
        if not run or run.status != "pending":
            raise HTTPException(404, "找不到這次待套用的匯入，請重新預覽")
        last = store.latest_run(s)
        snap = store.unpack(run.snapshot)
        old = _by_key(store.unpack(last.snapshot)) if last else {}
        new = _by_key(snap)
        aliases = dict(json.loads(run.diff).get("auto", {}))
        aliases.update({k: v for k, v in (body.get("aliases") or {}).items() if k in new and v in old})
        ids = {r.key: r for r in s.scalars(select(store.CaseId))}
        for c in old.values():
            c["id"] = ids[c["key"]].display if c["key"] in ids else ""
        used = {r.display for r in ids.values()}
        top = {}
        for disp in used:
            m = re.match(r"^([A-Z]+)(\d+)$", disp)
            if m:
                top[m.group(1)] = max(top.get(m.group(1), 0), int(m.group(2)))
        for c in snap["cases"]:
            k = c["key"]
            if k in ids:
                continue
            if aliases.get(k) in ids:  # 改過描述的同一筆：沿用原案號
                row = ids.pop(aliases[k])
                row_display = row.display
                s.delete(row)
                s.flush()
                new_row = store.CaseId(key=k, display=row_display)
                s.add(new_row)
                ids[k] = new_row
                continue
            legacy = c.get("legacy", "")
            prefix = re.match(r"^[A-Z]+", legacy).group(0)
            if last is None and legacy not in used:
                disp = legacy
            else:
                disp = prefix + str(top.get(prefix, 0) + 1).zfill(4)
            top[prefix] = max(top.get(prefix, 0), int(disp[len(prefix):]))
            used.add(disp)
            row = store.CaseId(key=k, display=disp)
            s.add(row)
            ids[k] = row
        s.flush()
        for c in snap["cases"]:
            c["id"] = ids[c["key"]].display
        d = diffing.diff(old, new, aliases)
        for k in ("new", "closed", "reopened", "status", "extended"):
            for c in d[k]:
                c["id"] = ids[c["key"]].display
        run.diff = json.dumps(d, ensure_ascii=False)
        run.snapshot = store.pack(snap)  # 連同案號一起存，之後即使案件改名也查得到當時的案號
        run.status = "applied"
        s.commit()
        return {"ok": True, "counts": d["counts"]}


@app.get("/api/import/runs")
def import_runs(user=Depends(auth.admin)):
    with store.session() as s:
        rows = s.scalars(select(store.Run).where(store.Run.status == "applied").order_by(store.Run.id.desc()).limit(20))
        return [{"id": r.id, "at": r.created_at.isoformat() + "Z", "by": r.by, "as_of": r.as_of,
                 "files": json.loads(r.files), "diff": json.loads(r.diff)} for r in rows]


# ---------- 帳號 ----------
@app.get("/api/users")
def users(user=Depends(auth.admin)):
    with store.session() as s:
        return [{"name": u.username, "role": u.role} for u in s.scalars(select(store.User).order_by(store.User.id))]


@app.post("/api/users")
async def add_user(request: Request, user=Depends(auth.admin)):
    body = await request.json()
    name, pw = (body.get("username") or "").strip(), body.get("password") or ""
    if not name or len(pw) < 8:
        raise HTTPException(400, "需要帳號名稱，密碼至少 8 個字")
    with store.session() as s:
        if s.scalars(select(store.User).where(store.User.username == name)).first():
            raise HTTPException(400, "這個帳號已經存在")
        s.add(store.User(username=name, pw_hash=auth.hash_password(pw), role="viewer"))
        s.commit()
    return {"ok": True}


@app.delete("/api/users/{name}")
def delete_user(name: str, user=Depends(auth.admin)):
    with store.session() as s:
        u = s.scalars(select(store.User).where(store.User.username == name)).first()
        if not u or u.role == "admin":
            raise HTTPException(400, "不能刪除這個帳號")
        s.delete(u)
        s.commit()
    return {"ok": True}


# ---------- API 評語 ----------
def _missing(s):
    run = store.latest_run(s)
    if not run:
        return None, []
    snap = with_ids(s, store.unpack(run.snapshot))
    cm, ov = store.kv_get(s, "cm", {}), store.kv_get(s, "ov", {})
    todo = [c for c in snap["cases"] if c["id"] not in cm and not (isinstance(ov.get(c["id"]), dict) and ov[c["id"]].get("cm"))]
    todo.sort(key=lambda c: (c["done"], c["id"]))  # 列管中的先寫
    return snap, todo


@app.get("/api/comments/status")
def comments_status(user=Depends(auth.admin)):
    with store.session() as s:
        _, todo = _missing(s)
    return {"progress": progress, "missing": len(todo), "estimate": commentary.estimate(len(todo)),
            "has_key": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.post("/api/comments/generate")
async def comments_generate(request: Request, user=Depends(auth.admin)):
    body = await request.json()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(400, "還沒有設定 ANTHROPIC_API_KEY")
    if progress["running"]:
        raise HTTPException(400, "已經在產生評語了")
    with store.session() as s:
        snap, todo = _missing(s)
    todo = todo[: max(1, min(int(body.get("limit") or 200), 10000))]
    progress.update(running=True, done=0, seen=0, total=len(todo), error="")

    def work():
        def tick(done, seen, err):
            progress.update(done=done, seen=seen, error=err or progress["error"])

        try:
            got = commentary.generate(todo, snap["vocab"], snap["weeks"], snap["today"], tick)
            with store.session() as s:
                cm = store.kv_get(s, "cm", {})
                cm.update(got)
                store.kv_set(s, "cm", cm)
                s.commit()
        except Exception as e:
            progress.update(error=str(e)[:200])
        finally:
            progress.update(running=False)

    threading.Thread(target=work, daemon=True).start()
    return {"ok": True, "total": len(todo)}
