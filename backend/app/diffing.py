"""比對兩次匯入：哪些是新案、哪些結案了、哪些狀態或期限變了、哪些不見了。"""
import re

from .rules import norm


def _brief(c, **extra):
    out = {"id": c.get("id", ""), "key": c["key"], "src": c["src"], "desc": c["desc"], "status": c.get("status", "")}
    out.update(extra)
    return out


def _bigrams(s):
    s = norm(s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def _dated_series(a, b):
    """「11/18 社群貼文」和「11/25 社群貼文」是每週一筆的例行案件，不是同一筆改名。"""
    strip = lambda s: re.sub(r"\d+", "#", norm(s))
    digits = lambda s: re.findall(r"\d+", s)
    return strip(a) == strip(b) and digits(a) != digits(b)


def auto_aliases(old, new):
    """描述完全相同、只是指紋的其他成分變了（例如首次期限被改）的一對一案件，直接視為同一筆。"""
    missing = [c for k, c in old.items() if k not in new]
    fresh = [c for k, c in new.items() if k not in old]
    groups = {}
    for c in missing:
        groups.setdefault((c["g"], c["src"], norm(c["desc"])), [[], []])[0].append(c)
    for c in fresh:
        groups.setdefault((c["g"], c["src"], norm(c["desc"])), [[], []])[1].append(c)
    return {b[0]["key"]: a[0]["key"] for a, b in groups.values() if len(a) == 1 and len(b) == 1}


def suggest_aliases(old, new, taken):
    """描述被改過的案件：在同一來源裡找名稱最像的「不見的舊案」，交給人確認。"""
    missing = [(c, _bigrams(c["desc"])) for k, c in old.items() if k not in new and k not in taken.values()]
    out = []
    for k, c in new.items():
        if k in old or k in taken:
            continue
        b = _bigrams(c["desc"])
        best = None
        for m, mb in missing:
            if m["src"] != c["src"] or len(b) < 3 or len(mb) < 3:
                continue
            if _dated_series(m["desc"], c["desc"]):
                continue
            j = len(b & mb) / len(b | mb)
            if j >= 0.5 and (best is None or j > best[0]):
                best = (j, m)
        if best:
            out.append({"new": _brief(c), "old": _brief(best[1]), "score": round(best[0], 2)})
    return sorted(out, key=lambda x: -x["score"])[:100]


def diff(old, new, aliases=None):
    """old、new 都是 {指紋: 案件}。aliases 是 {新指紋: 舊指紋}。"""
    aliases = aliases or {}
    result = {"new": [], "closed": [], "reopened": [], "status": [], "extended": [], "missing": []}
    matched = set()
    for k, c in new.items():
        o = old.get(aliases.get(k, k))
        if o is None:
            result["new"].append(_brief(c))
            continue
        matched.add(o["key"])
        was, now = (1 if o["done"] else 0), (1 if c["done"] else 0)
        if now and not was:
            result["closed"].append(_brief(c, before=o.get("status", "")))
        elif was and not now:
            result["reopened"].append(_brief(c, before=o.get("status", "")))
        elif (o.get("status") or "") != (c.get("status") or ""):
            result["status"].append(_brief(c, before=o.get("status", "")))
        if o.get("due") and c.get("due") and c["due"] > o["due"]:
            result["extended"].append(_brief(c, before=o["due"], after=c["due"]))
    result["missing"] = [_brief(o) for k, o in old.items() if k not in matched]
    result["counts"] = {k: len(v) for k, v in result.items() if isinstance(v, list)}
    result["counts"]["total"] = len(new)
    return result
