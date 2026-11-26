"""用 Claude API 幫案件寫評語。金鑰放在環境變數 ANTHROPIC_API_KEY，不進前端也不進程式庫。"""
import datetime
import json
import os
import re

from .rules import NO_PROGRESS

MODEL = os.environ.get("COMMENT_MODEL", "claude-haiku-5-5")
BATCH = 20
UNITS = {"Design": "多媒體設計（平面）", "Video": "多媒體設計（影片）", "UI": "多媒體設計（UI）", "Coding": "MIS（Coding）",
         "Support": "MIS（Support）"}
SYSTEM = """你是「行銷案件生命跡象觀測中心」的官方評語撰寫員，自稱「本中心」。
替每個工作案件寫一句評語：語氣像正式公文，內容其實在幽默地吐槽，正經、有趣、不刻薄。
規則：
- 繁體中文，每則 25 到 50 個字，一到兩句。
- 只根據提供的事實寫，數字照抄，不要編造沒給的資訊。
- 對事不對人，可以提案件與產品名稱，不嘲笑個人。
- 每則都要不同，不要套同一個句型。
範例：
- 待 PM 通知，已待 40 週。本中心合理懷疑通知寄錯了地方。
- 修改至第 7 版，為現役最高紀錄。本案本身就是一趟長途運輸。
- 准予結案。本中心查無異常，這本身就是一種異常。
回覆格式：只輸出一個 JSON 物件，鍵是案號，值是評語，不要其他文字。"""


def facts(case, vocab, weeks, today):
    """把一個案件濃縮成幾個事實，給模型參考。"""
    f = {"案號": case["id"], "單位": UNITS.get(case["src"], "行銷企劃"), "名稱": case["desc"], "狀態": case.get("status") or "未填"}
    if case.get("topic"):
        f["分類"] = case["topic"]
    if case["done"]:
        f["結果"] = "已結案" + ("（Excel 列已收起，沒有寫完成）" if case.get("auto") else "")
    else:
        t = datetime.date.fromisoformat(today)
        if case.get("due"):
            late = (t - datetime.date.fromisoformat(case["due"])).days
            if late > 0:
                f["逾期天數"] = late
        h = case.get("h") or []
        real = [weeks[h[i]] for i in range(0, len(h), 2) if not NO_PROGRESS.search(vocab[h[i + 1]])]
        base = max(real) if real else case.get("req")
        if base:
            stall = round((t - datetime.date.fromisoformat(base)).days / 7)
            if stall >= 2:
                f["沒有進度週數"] = stall
    if case.get("ext"):
        f["展延次數"] = case["ext"]
    if case.get("ver", 0) >= 2:
        f["修改到第幾版"] = case["ver"]
    return f


def estimate(n_cases):
    """粗估用量（字元數），實際費用以官方價格為準。"""
    batches = -(-n_cases // BATCH)
    return {"cases": n_cases, "requests": batches, "input_chars": batches * len(SYSTEM) + n_cases * 160,
            "output_chars": n_cases * 60, "model": MODEL}


def write_batch(client, items):
    msg = client.messages.create(model=MODEL, max_tokens=2500, system=SYSTEM,
                                 messages=[{"role": "user", "content": json.dumps(items, ensure_ascii=False)}])
    raw = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    m = re.search(r"\{.*\}", raw, re.S)
    data = json.loads(m.group(0)) if m else {}
    return {k: str(v).strip() for k, v in data.items() if isinstance(v, str) and v.strip()}


def generate(cases, vocab, weeks, today, on_progress):
    import anthropic  # 只有真的要產生評語時才需要

    client = anthropic.Anthropic()
    out = {}
    for i in range(0, len(cases), BATCH):
        chunk = cases[i:i + BATCH]
        try:
            got = write_batch(client, [facts(c, vocab, weeks, today) for c in chunk])
            ids = {c["id"] for c in chunk}
            out.update({k: v for k, v in got.items() if k in ids})
        except Exception as e:  # 單一批次失敗不影響其他批次
            on_progress(len(out), min(i + BATCH, len(cases)), str(e)[:200])
            continue
        on_progress(len(out), min(i + BATCH, len(cases)), "")
    return out
