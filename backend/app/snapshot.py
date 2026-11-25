"""把兩份 Excel 的解析結果整理成一份「快照」：案件清單、週次、圖表用的統計。"""
import collections
import re

from .rules import ISO, NO_PROGRESS, case_key, is_done, max_version, minus_days, norm

MAKE_PREFIX = {"Design": "D", "Video": "V", "Coding": "C", "Support": "P", "UI": "U"}
MAKE_UNITS = ["Design", "Coding", "Video", "Support", "UI"]
LANG = {"ENGLISH": "EN", "ENG": "EN", "US": "EN", "USA": "EN", "GB": "EN", "UK": "EN", "JPN": "JP", "JA": "JP",
        "DEU": "DE", "GER": "DE", "FRA": "FR", "ESP": "ES", "ESD": "ES", "SP": "ES", "BRA": "PT", "BR": "PT",
        "PT-BR": "PT", "POR": "PT", "VNM": "VN", "RUS": "RU", "ITA": "IT", "POL": "PL", "NLD": "NL", "KOR": "KR",
        "KO": "KR", "CH": "TC", "CHT": "TC", "TW": "TC", "CHS": "SC", "CN": "SC", "ALL": "全語系", "M": "多語",
        "ARA": "AR", "TUR": "TR", "THA": "TH", "IDN": "ID"}
GENERIC_TOPICS = {"General", "Exhibition", "eCommerce", "", "Gemeral", "Product", "Software", "Event", "Issue",
                  "Project", "Webpage"}


def planner_prefixes(names):
    """每位企劃一個字母代號；撞到別人或撞到製作單代號時，改用名字裡下一個可用字母。"""
    used, out = set(MAKE_PREFIX.values()), {}
    for name in names:
        letters = [ch.upper() for ch in name if ch.isalpha()] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        p = next(ch for ch in letters if ch not in used)
        used.add(p)
        out[name] = p
    return out


def _clean(case):
    return {k: v for k, v in case.items() if v not in ("", None, [], 0) or k == "done"}


def build(team, creatives, as_of=None):
    planners = team["planners"]
    current = [p["name"] for p in planners if not p["former"]]
    former = [p["name"] for p in planners if p["former"]]
    names = current + former
    prefix = planner_prefixes(names)
    weeks = sorted({w for p in planners for w in p["weeks"]}, reverse=True)
    wi = {w: i for i, w in enumerate(weeks)}
    latest = max((p["weeks"][0] for p in planners if not p["former"] and p["weeks"]), default=None) or (weeks[0] if weeks else None)
    as_of = as_of or latest
    recent_due = minus_days(as_of, 18) if as_of else ""
    vocab, vindex = [], {}

    def vi(s):
        s = s.replace("\n", " / ")[:60]
        if s not in vindex:
            vindex[s] = len(vocab)
            vocab.append(s)
        return vindex[s]

    cases, shw, sums = [], {}, {}
    upd = collections.defaultdict(collections.Counter)
    npc = collections.defaultdict(collections.Counter)
    allc = collections.defaultdict(collections.Counter)
    for p in sorted(planners, key=lambda x: names.index(x["name"])):
        name = p["name"]
        shw[name] = [wi[w] for w in p["weeks"]]
        sums[name] = {str(wi[w]): v for w, v in p["summaries"].items()}
        latest4 = set(p["weeks"][:4])
        seen_desc = collections.Counter()
        for it in p["items"]:
            cells = it["cells"]
            status = it["last_status"] or (cells[0][1] if cells else "")
            status = status.replace("\n", " ")[:40]
            real = [v for _, v in cells if not NO_PROGRESS.search(v)]
            if NO_PROGRESS.search(status) and real:
                status = real[0].replace("\n", " ")[:40]
            for w, v in cells:
                m = w[:7]
                allc[name][m] += 1
                (npc if NO_PROGRESS.search(v) else upd)[name][m] += 1
            due = it["deadline"] if ISO.match(it["deadline"]) else None
            last_real = next((w for w, v in cells if not NO_PROGRESS.search(v)), None)
            done, auto = (1 if is_done(status) else 0), 0
            if not done:
                if p["former"]:
                    done = 2  # 已離開的企劃：只留歷史
                elif it["hidden"]:
                    done, auto = 1, 1  # 列已被收起，視為結案
            closed = None
            if done == 1:
                closed = next((w for w, v in reversed(cells) if is_done(v)), None) or last_real or due or (cells[-1][0] if cells else None)
            n = norm(it["desc"])
            occ = seen_desc[n]
            seen_desc[n] += 1
            cases.append(_clean({
                "key": case_key("p", name, n, occ), "legacy": prefix[name] + str(it["row"]).zfill(4),
                "g": "p", "src": name, "topic": it["topic"][:40], "desc": it["desc"][:170], "status": status,
                "due": due, "duetxt": "" if due else it["deadline"][:20], "done": done, "auto": auto,
                "hid": 1 if it["hidden"] else 0, "req": cells[-1][0] if cells else None, "closed": closed,
                "ver": max_version(status, *[v for _, v in cells]),
                "nnp": sum(1 for _, v in cells if NO_PROGRESS.search(v)), "nup": len(cells),
                "h": [x for w, v in cells for x in (wi[w], vi(v))],
            }))
    counter, make_seen = collections.Counter(), collections.Counter()
    for c in creatives:
        c = dict(c)
        counter[c["src"]] += 1
        base = (c["src"], norm(c["desc"]), c.pop("_first_due", ""))
        c["key"] = case_key("m", *base, make_seen[base])
        make_seen[base] += 1
        c["legacy"] = MAKE_PREFIX[c["src"]] + str(counter[c["src"]]).zfill(4)
        cases.append(_clean(c))
    year = int(as_of[:4]) if as_of else 0
    return {"cases": cases, "weeks": weeks, "vocab": vocab, "shw": shw, "sums": sums, "today": as_of,
            "planners": {"current": current, "former": former, "prefix": prefix},
            "ch": charts(cases, names, upd, npc, allc, year)}


def charts(cases, names, upd, npc, allc, year):
    make = [c for c in cases if c["g"] == "m"]
    months = sorted({m for n in allc for m in allc[n]})
    ch = {"months": months,
          "upd": {n: [upd[n].get(m, 0) for m in months] for n in names},
          "np": {n: [(round(npc[n][m] / allc[n][m], 3) if allc[n].get(m, 0) >= 8 else None) for m in months] for n in names},
          "npn": {n: [[npc[n].get(m, 0), allc[n].get(m, 0)] for m in months] for n in names}}
    q, ym = collections.defaultdict(collections.Counter), collections.Counter()
    for c in make:
        dt = c.get("closed") if c["done"] else None
        if dt and dt[:4] >= "2023" and dt[:4] <= str(year):
            q[dt[:4] + "Q" + str((int(dt[5:7]) - 1) // 3 + 1)][c["src"]] += 1
            ym[dt[:7]] += 1
    qs = sorted(q)
    ch["q"] = {"labels": qs, "series": {u: [q[k].get(u, 0) for k in qs] for u in MAKE_UNITS}}
    ch["ym"] = dict(ym)
    lc = collections.Counter()
    for c in make:
        for t in set(re.split(r"[\/,、&\s]+", c.get("lang", "").upper())):
            t = LANG.get(t, t)
            if t and (t in ("全語系", "多語") or re.match(r"^[A-Z]{2}$", t)):
                lc[t] += 1
    ch["lang"] = lc.most_common(14)
    gd, gdo, ex = collections.Counter(), collections.Counter(), collections.Counter()
    for c in make:
        if c.get("yr") != year:
            continue
        if c.get("gd") and c["gd"].strip() not in ("TBD", "-"):
            k = c["gd"].strip().split(" ")[0]
            gd[k] += 1
            gdo[k] += 0 if c["done"] else 1
        t = c.get("topic", "")
        if t in GENERIC_TOPICS:
            t = c.get("cat", "") if c.get("topic") in ("Exhibition", "Event") else ""
        if t and t not in ("Webpage", "Product", "Leaflet", "Exhibition", "Amazon", "Graphics"):
            ex[t.strip()] += 1
    ch["gd"] = [[k, v, gdo[k]] for k, v in gd.most_common(8)]
    ch["ex"] = ex.most_common(12)
    vd = collections.Counter(min(c.get("ver", 0), 7) for c in cases if c.get("ver", 0) >= 1)
    ch["ver"] = [[("V%d" % k) + ("+" if k == 7 else ""), vd.get(k, 0)] for k in range(1, 8)]
    return ch
