"""解析製作需求總表：設計、影片、Coding、Support、UI，各年度進行中與結案。

只讀名稱符合「年度 + 單位（+ 結案）」的工作表，備份或另存的工作表會被略過。
"""
import re

import openpyxl

from .rules import MAKE_DONE, max_version, text
from .rules import date as rules_date

UNITS = {"design": "Design", "video": "Video", "coding": "Coding", "support": "Support", "ui design": "UI"}
ORDER = ["Mix", "Design", "Video", "Coding", "Support", "UI"]
ALIASES = {
    "topic": ["活動主題"], "cat": ["分類"], "kind": ["種類"], "desc": ["描述", "產品"], "lang": ["需求語言", "語言"],
    "sku": ["行銷品號", "品號", "工作單編號"], "req": ["申請時間", "提出時間", "提案時間"],
    "due": ["需求時間", "希望完成時間"], "due2": ["調整時間", "調整後時間", "調整順序"],
    "due3": ["再次調整後時間", "GD 預估時間"], "status": ["狀態", "Status"], "pic": ["PIC", "需求者"], "gd": ["GD"],
    "remark": ["Remark"], "note": ["Note"], "fmt": ["檔案格式"],
    "closed": ["正式結案時間", "結案日期", "結單日期", "完成時間", "結案時間"], "fv": ["第一版時間"],
}
SHEET = re.compile(r"^(\d{4})\s+(design|video|coding|support|ui design)(\s*結案)?$", re.I)
MIX = re.compile(r"^(\d{4})\s*結案$")


def _sheets(wb):
    found = []
    for name in wb.sheetnames:
        clean = re.sub(r"\s+", " ", name.strip())
        m = SHEET.match(clean)
        if m:
            found.append((name, UNITS[m.group(2).lower()], bool(m.group(3)), int(m.group(1))))
            continue
        m = MIX.match(clean)
        if m:
            found.append((name, "Mix", True, int(m.group(1))))
    # 同一單位：先讀各年結案（由舊到新），最後讀進行中，進行中的版本優先
    found.sort(key=lambda s: (ORDER.index(s[1]), 0 if s[2] else 1, s[3]))
    return found


def parse(path, current_year=None):
    wb = openpyxl.load_workbook(path, data_only=True)
    sheets = _sheets(wb)
    current_year = current_year or max((s[3] for s in sheets), default=0)
    seen, late = {}, []
    for name, src0, closed, yr in sheets:
        rows = list(wb[name].iter_rows(values_only=True))
        if not rows:
            continue
        hdr = [text(h) for h in rows[0]]
        idx = {k: next((hdr.index(a) for a in v if a in hdr), None) for k, v in ALIASES.items()}
        if idx["desc"] is None:
            continue

        def date(v, lo=yr - 3, hi=yr + 2):  # 這張表的年度前後幾年內才算合理日期
            return rules_date(v, lo, hi)

        for r in rows[1:]:
            if sum(1 for v in r if text(v)) < 3:
                continue

            def g(k):
                i = idx[k]
                return r[i] if i is not None and i < len(r) else None

            desc = text(g("desc")).replace("\n", " ")
            if not desc or "範例" in desc:
                continue
            status, pic, gd = text(g("status")), text(g("pic")), text(g("gd"))
            shifted = bool(MAKE_DONE.fullmatch(pic))
            if shifted:  # 承辦人欄被填成「結案」：照實修正，並排到最後，避免打亂其他案號
                if MAKE_DONE.search(status):
                    pic = ""
                else:  # 整列往右錯了一格
                    status, pic, gd = pic, "", status
            src = src0
            if src == "Mix":
                blob = (text(g("cat")) + text(g("kind")) + text(g("fmt"))).lower()
                src = ("Video" if ("video" in blob or "mp4" in blob or "mpeg" in blob)
                       else "Coding" if ("html" in blob or "landing" in blob or "webpage" in blob) else "Design")
            log = text(g("note")) if src0 == "Video" else text(g("remark"))
            log = re.sub(r"https?://\S+", "[連結]", log)
            lines = [ln.strip()[:130] for ln in log.split("\n") if ln.strip()][: (8 if yr == current_year else 4)]
            dues = []
            for x in (date(g("due")), date(g("due2")), date(g("due3"))):
                if x and x not in dues:
                    dues.append(x)
            done = 1 if (closed or MAKE_DONE.search(status)) else 0
            case = {
                "g": "m", "src": src, "yr": yr, "topic": text(g("topic"))[:40], "cat": text(g("cat"))[:40],
                "kind": text(g("kind"))[:30], "desc": desc[:170], "lang": text(g("lang"))[:30],
                "sku": text(g("sku"))[:24], "req": date(g("req")), "due": dues[-1] if dues else None,
                "ext": max(0, len(dues) - 1), "due0": dues[0] if len(dues) > 1 else None,
                "status": status[:40] or ("結案" if done else ""), "pic": pic[:24],
                "gd": gd[:16] if src != "Support" else "", "log": lines,
                "ver": max_version(status, log), "closed": date(g("closed")) or (dues[-1] if done and dues else None),
                "fv": date(g("fv")), "done": done, "_first_due": dues[0] if dues else "",
            }
            if shifted:
                late.append(case)
                continue
            k = (src, desc, case["_first_due"])
            if k in seen and seen[k]["done"] <= done:
                continue  # 同一筆同時出現在進行中與結案表時，留進行中的那筆
            seen[k] = case
    wb.close()
    return list(seen.values()) + late
