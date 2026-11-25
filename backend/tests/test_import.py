"""用程式產生的假 Excel 測試判讀規則，不使用任何真實資料。"""
import datetime

import openpyxl
import pytest

from app import diffing, excel_creatives, excel_team, rules, snapshot

W1, W2, W3 = datetime.date(2030, 3, 4), datetime.date(2030, 3, 11), datetime.date(2030, 3, 25)


def team_book(path, extra_row=None, edit=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Alice"
    ws.append(["Category", "Description", "Last Status", "Deadline", W3, W2, W1])
    for label in ("本週完成項目", "本週進度項目", "下週預計完成項目"):
        ws.append(["", label, "", "", "寫了一些事" if label.startswith("本週完成") else None])
    rows = [
        ["FAQ", "FAQ 第一批上線", "已完成", datetime.date(2030, 3, 10), "已完成", "進行中", "Pending"],
        ["Project", "新官網", "等Coding", datetime.date(2030, 4, 1), "等Coding", "修改V3", "已開單"],
        ["Video", "教學影片", "", datetime.date(2030, 3, 1), None, "待送印", "進行中"],  # 會被隱藏
        ["General", "還沒開始的案子", "", datetime.date(2030, 5, 1), None, None, None],
        ["General", "重複名稱", "", None, "進行中", None, None],
        ["General", "重複名稱", "", None, "沒有進度", "沒有進度", "進行中"],
    ]
    if extra_row:
        rows.insert(1, extra_row)
    for r in rows:
        if edit and r[1] in edit:
            r = edit[r[1]](list(r))
        ws.append(r)
    for i, row in enumerate(ws.iter_rows(min_row=5), start=5):
        if row[1].value == "教學影片":
            ws.row_dimensions[i].hidden = True
    old = wb.create_sheet("Bob")
    old.append(["Type", "Description", "Deadline", W2, W1])
    for _ in range(3):
        old.append([None, None, None, None, None])
    old.append(["General", "前同事留下的案子", datetime.date(2030, 1, 1), "進行中", "進行中"])
    old.sheet_state = "hidden"
    wb.save(path)
    return str(path)


def make_book(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "2030 Coding"
    hdr = ["優先順序", "活動主題", "分類", "種類", "描述", "提出時間", "需求時間", "調整後時間", "再次調整後時間", "狀態", "PIC", "Remark"]
    ws.append(hdr)
    ws.append([1, "General", "Webpage", "Landing", "新官網上線", datetime.date(2030, 2, 1), datetime.date(2030, 3, 1),
               datetime.date(2030, 3, 20), datetime.date(2030, 4, 5), "待確認", "Alice", "2/10 V2 修改\n3/1 測試站"])
    ws.append([2, "General", "Webpage", "Banner", "首頁 Banner", datetime.date(2030, 2, 5), datetime.date(2205, 3, 1),
               None, None, "進行中", "Alice", ""])
    closed = wb.create_sheet("2030 Coding 結案")
    closed.append(hdr + ["結案日期"])
    closed.append([1, "General", "Webpage", "Page", "舊活動頁下架", datetime.date(2030, 1, 5), datetime.date(2030, 1, 9),
                   None, None, "結案", "Alice", "", datetime.date(2030, 1, 8)])
    closed.append([1, "General", "Webpage", "Page", "承辦人欄填錯的列", datetime.date(2030, 1, 5), datetime.date(2030, 1, 9),
                   None, None, "結案", "結案", "", datetime.date(2030, 1, 8)])
    wb.create_sheet("2030 Coding-備份").append(hdr)
    wb.save(path)
    return str(path)


@pytest.fixture
def snap(tmp_path):
    team = excel_team.parse(team_book(tmp_path / "team.xlsx"))
    make = excel_creatives.parse(make_book(tmp_path / "make.xlsx"), 2030)
    return snapshot.build(team, make, "2030-03-25")


def by_desc(snap):
    out = {}
    for c in snap["cases"]:
        out.setdefault(c["desc"], []).append(c)
    return out


def test_status_words():
    assert rules.is_done("已完成") and rules.is_done("結案")
    assert not rules.is_done("完成，待上傳") and not rules.is_done("進行中") and not rules.is_done("")


def test_hidden_sheet_is_former_planner(snap):
    assert snap["planners"]["current"] == ["Alice"] and snap["planners"]["former"] == ["Bob"]
    assert by_desc(snap)["前同事留下的案子"][0]["done"] == 2


def test_hidden_row_counts_as_closed(snap):
    c = by_desc(snap)["教學影片"][0]
    assert c["done"] == 1 and c["auto"] == 1 and c["status"] == "待送印" and c["closed"] == "2030-03-11"


def test_visible_rows_stay_open_even_without_status(snap):
    d = by_desc(snap)
    assert d["還沒開始的案子"][0]["done"] == 0
    assert d["新官網"][0]["done"] == 0 and d["新官網"][0]["ver"] == 3
    assert d["FAQ 第一批上線"][0]["done"] == 1 and "auto" not in d["FAQ 第一批上線"][0]


def test_same_description_gets_distinct_keys(snap):
    a, b = by_desc(snap)["重複名稱"]
    assert a["key"] != b["key"]


def test_creatives_dates_extensions_and_backup_sheets(snap):
    d = by_desc(snap)
    site = d["新官網上線"][0]
    assert site["ext"] == 2 and site["due"] == "2030-04-05" and site["due0"] == "2030-03-01" and site["ver"] == 2
    assert d["首頁 Banner"][0].get("due") is None  # 2205 年是打錯的
    assert d["舊活動頁下架"][0]["done"] == 1 and d["舊活動頁下架"][0]["closed"] == "2030-01-08"
    assert d["承辦人欄填錯的列"][0].get("pic") is None
    assert all(c["src"] in ("Alice", "Bob", "Coding") for c in snap["cases"])


def test_reimport_keeps_identity_and_reports_changes(tmp_path, snap):
    edit = {"新官網": lambda r: r[:2] + ["已上線", datetime.date(2030, 4, 15)] + ["已上線"] + r[5:]}
    team2 = excel_team.parse(team_book(tmp_path / "team2.xlsx", edit=edit,
                                       extra_row=["FAQ", "FAQ 第二批", "Pending", datetime.date(2030, 4, 1), "Pending", None, None]))
    make2 = excel_creatives.parse(make_book(tmp_path / "make2.xlsx"), 2030)
    snap2 = snapshot.build(team2, make2, "2030-03-25")
    old = {c["key"]: c for c in snap["cases"]}
    new = {c["key"]: c for c in snap2["cases"]}
    d = diffing.diff(old, new, diffing.auto_aliases(old, new))
    assert [c["desc"] for c in d["new"]] == ["FAQ 第二批"]  # 插入一列不會讓其他案件變成新案
    assert [c["desc"] for c in d["closed"]] == ["新官網"]
    assert [c["desc"] for c in d["extended"]] == ["新官網"]
    assert d["missing"] == []


def test_renamed_case_is_suggested_not_silently_duplicated(tmp_path, snap):
    edit = {"還沒開始的案子": lambda r: [r[0], "還沒開始的案子（改名）"] + r[2:]}
    team2 = excel_team.parse(team_book(tmp_path / "team3.xlsx", edit=edit))
    make2 = excel_creatives.parse(make_book(tmp_path / "make3.xlsx"), 2030)
    old = {c["key"]: c for c in snap["cases"]}
    new = {c["key"]: c for c in snapshot.build(team2, make2, "2030-03-25")["cases"]}
    auto = diffing.auto_aliases(old, new)
    sug = diffing.suggest_aliases(old, new, auto)
    assert len(sug) == 1 and sug[0]["old"]["desc"] == "還沒開始的案子"


def test_weekly_recurring_items_are_not_treated_as_renames():
    old = {"a": {"key": "a", "g": "p", "src": "Alice", "desc": "11/18 Social Media", "done": 0}}
    new = {"b": {"key": "b", "g": "p", "src": "Alice", "desc": "11/25 Social Media", "done": 0}}
    assert diffing.suggest_aliases(old, new, {}) == []
