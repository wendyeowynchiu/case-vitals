"""解析企劃週追蹤表：每位企劃一張工作表，每週一欄。

隱藏的工作表視為已離開的企劃；隱藏的列視為已收起（結案）的案件。
"""
import re
import zipfile

import openpyxl

from .rules import ISO, text


def _sheet_meta(path):
    """直接讀 xlsx 內的 XML，取得工作表順序、是否隱藏、哪些列被隱藏。"""
    z = zipfile.ZipFile(path)
    wbx = z.read("xl/workbook.xml").decode("utf-8", "ignore")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "ignore")
    targets = {}
    for m in re.finditer(r"<Relationship\b[^>]*>", rels):
        tag = m.group(0)
        rid = re.search(r'\bId="([^"]+)"', tag)
        tgt = re.search(r'\bTarget="([^"]+)"', tag)
        if rid and tgt:
            targets[rid.group(1)] = tgt.group(1)
    meta = {}
    for m in re.finditer(r"<sheet\b[^>]*>", wbx):
        tag = m.group(0)
        name = re.search(r'\bname="([^"]*)"', tag).group(1)
        name = name.replace("&amp;", "&").replace("&apos;", "'").replace("&quot;", '"')
        rid = re.search(r'\br:id="([^"]+)"', tag).group(1)
        state = re.search(r'\bstate="([^"]+)"', tag)
        target = targets.get(rid, "")
        target = target[1:] if target.startswith("/") else "xl/" + target
        hidden_rows = set()
        try:
            xml = z.read(target).decode("utf-8", "ignore")
            for row in re.finditer(r"<row\b[^>]*>", xml):
                if 'hidden="1"' in row.group(0) or 'hidden="true"' in row.group(0):
                    hidden_rows.add(int(re.search(r'\br="(\d+)"', row.group(0)).group(1)))
        except KeyError:
            pass
        meta[name] = {"hidden": bool(state and state.group(1) != "visible"), "hidden_rows": hidden_rows}
    return meta


def parse(path):
    meta = _sheet_meta(path)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    planners = []
    for ws in wb:
        rows, empty = [], 0
        for r in ws.iter_rows(values_only=True, max_col=400):
            v = [text(x) for x in r]
            if not any(v):
                empty += 1
                if empty > 60:
                    break
            else:
                empty = 0
            rows.append(v)
        while rows and not any(rows[-1]):
            rows.pop()
        if len(rows) < 5:
            continue
        hdr = rows[0]
        week_cols = [(i, h) for i, h in enumerate(hdr) if ISO.match(h)]
        if len(week_cols) < 2 or len(hdr) < 3:
            continue  # 不是週追蹤表
        first_week = week_cols[0][0]
        status_col = next((i for i, h in enumerate(hdr[:first_week]) if "status" in h.lower()), None)
        deadline_col = next((i for i, h in enumerate(hdr[:first_week]) if h.lower().startswith("deadline")), first_week - 1)
        m = meta.get(ws.title, {"hidden": False, "hidden_rows": set()})
        summaries = {}
        for k, r in enumerate(rows[1:4]):
            for i, h in week_cols:
                if i < len(r) and r[i]:
                    summaries.setdefault(h, ["", "", ""])[k] = r[i][:900]
        items = []
        for ri, r in enumerate(rows[4:], start=5):
            if len(r) < 2 or not r[1]:
                continue
            r = r + [""] * (len(hdr) - len(r))
            items.append({
                "row": ri,
                "topic": r[0],
                "desc": r[1].replace("\n", " "),
                "last_status": r[status_col] if status_col is not None else "",
                "deadline": r[deadline_col],
                "cells": [(h, r[i]) for i, h in week_cols if r[i]],
                "hidden": ri in m["hidden_rows"],
            })
        planners.append({"name": ws.title, "former": m["hidden"], "weeks": [h for _, h in week_cols],
                         "summaries": summaries, "items": items})
    wb.close()
    return {"planners": planners}
