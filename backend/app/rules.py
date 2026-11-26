"""判定規則：狀態文字怎麼讀、案件怎麼算結案、穩定案號怎麼產生。

這裡只放通用規則，不放任何人名或案件名稱。
"""
import datetime
import hashlib
import re

ISO = re.compile(r"^\d{4}-\d\d-\d\d$")
NO_PROGRESS = re.compile(r"沒有進度|沒進度|無進度")
DONE = re.compile(r"完成|結案|已上線|已結束|取消|cancel|已測試|done|已上傳|已發布|已發佈", re.I)
WAITING = re.compile(r"待|等")
VERSION = re.compile(r"[Vv](\d)\b")
MAKE_DONE = re.compile(r"結案|cancel|取消", re.I)


CLOSING = re.compile(r"結案|已上線|已結束|取消|cancel|已測試|done|已上傳|已發布|已發佈", re.I)
FINAL_STEP = re.compile(r"上線|上架|上傳|發布|發佈|更新|印製|付款|寄出|交付|報名|加工|收到|確認", re.I)
FILLER = re.compile(r"[\d/\-.:月日號已經都全部]|大致")


def is_done(status: str) -> bool:
    """寫了完成類字眼、而且不是「完成，待上傳」這種還在等的，才算結案。

    「設計完成」「圖片完成」「Coding已完成」只是某一段做完，整個案件還沒結束，不算結案；
    「已完成」「5/7完成」「上線完成」才算。
    """
    if not status or WAITING.search(status) or not DONE.search(status):
        return False
    if CLOSING.search(status):
        return True
    for m in re.finditer(r"([^,，;；。\s/()（）]*)完成", status):
        what = FILLER.sub("", m.group(1))
        if not what or FINAL_STEP.search(what):
            return True
    return False


def text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return str(v).replace("\xa0", " ").strip()


def date(v, lo=2000, hi=2100):
    """只接受落在合理年份範圍內的日期，明顯打錯年份的（例如 2205 年）當作沒填。"""
    if isinstance(v, (datetime.datetime, datetime.date)) and lo <= v.year <= hi:
        return v.strftime("%Y-%m-%d")
    return None


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9一-鿿]", "", (s or "").lower())


def case_key(*parts) -> str:
    """案件指紋。Excel 的列沒有編號，只能用「來源＋描述」認案。"""
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]


def max_version(*texts) -> int:
    found = [int(x) for t in texts for x in VERSION.findall(t or "")]
    return max(found) if found else 0


def minus_days(iso: str, n: int) -> str:
    return (datetime.date.fromisoformat(iso) - datetime.timedelta(days=n)).isoformat()
