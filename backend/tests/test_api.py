import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setenv("ADMIN_USER", "boss")
    monkeypatch.setenv("ADMIN_PASSWORD", "correct-horse-1")
    for m in [m for m in sys.modules if m == "app" or m.startswith("app.")]:
        del sys.modules[m]
    from app.main import app
    return TestClient(app)


def login(c, user="boss", pw="correct-horse-1"):
    return c.post("/api/login", json={"username": user, "password": pw})


def test_login_required_and_roles(client, tmp_path):
    from test_import import make_book, team_book
    assert client.get("/api/bootstrap").status_code == 401
    assert login(client, pw="wrong").status_code == 401
    assert login(client).status_code == 200
    with open(team_book(tmp_path / "t.xlsx"), "rb") as t, open(make_book(tmp_path / "m.xlsx"), "rb") as m:
        p = client.post("/api/import/preview", files={"team": ("t.xlsx", t), "creatives": ("m.xlsx", m)},
                        data={"as_of": "2030-03-25"}).json()
    assert p["first"] and p["diff"]["counts"]["new"] == p["diff"]["counts"]["total"]
    assert client.post(f"/api/import/apply/{p['run']}", json={}).json()["ok"]
    boot = client.get("/api/bootstrap").json()
    ids = [c["id"] for c in boot["db"]["cases"]]
    assert len(ids) == len(set(ids)) and all(ids) and "key" not in boot["db"]["cases"][0]
    assert client.put("/api/state", json={ids[0]: {"cm": "測試評語"}}).status_code == 200
    assert client.post("/api/users", json={"username": "reader", "password": "long-enough-pw"}).status_code == 200
    client.post("/api/logout")
    assert login(client, "reader", "long-enough-pw").status_code == 200
    boot = client.get("/api/bootstrap").json()
    assert boot["role"] == "viewer" and boot["ov"][ids[0]]["cm"] == "測試評語"
    assert client.put("/api/state", json={}).status_code == 403
    assert client.get("/api/users").status_code == 403
    assert client.post("/api/import/preview", data={"as_of": ""}).status_code == 403


def test_second_import_keeps_case_numbers(client, tmp_path):
    import datetime
    from test_import import make_book, team_book
    login(client)

    def run(team_path):
        with open(team_path, "rb") as t, open(make_book(tmp_path / "m.xlsx"), "rb") as m:
            p = client.post("/api/import/preview", files={"team": ("t.xlsx", t), "creatives": ("m.xlsx", m)},
                            data={"as_of": "2030-03-25"}).json()
        client.post(f"/api/import/apply/{p['run']}", json={})
        return p, {c["desc"]: c["id"] for c in client.get("/api/bootstrap").json()["db"]["cases"]}

    _, first = run(team_book(tmp_path / "a.xlsx"))
    p, second = run(team_book(tmp_path / "b.xlsx", extra_row=["FAQ", "新插入的一列", "Pending", datetime.date(2030, 4, 1), "Pending", None, None]))
    assert p["diff"]["counts"]["new"] == 1 and not p["first"]
    assert all(second[d] == i for d, i in first.items() if d != "重複名稱")
    assert second["新插入的一列"] not in first.values()
    boot = client.get("/api/bootstrap").json()
    assert [c["desc"] for c in boot["diff"]["new"]] == ["新插入的一列"] and boot["diff"]["new"][0]["id"] == second["新插入的一列"]
    assert "key" not in boot["diff"]["new"][0] and len(boot["prev"]["cases"]) == len(boot["db"]["cases"]) - 1
    assert all(c["id"] for c in boot["prev"]["cases"])


def test_manual_match_keeps_case_number_across_planners(client, tmp_path):
    """描述大改或移交給另一位企劃時，管理者可以手動指認，案號要沿用。"""
    import openpyxl
    from test_import import make_book, team_book
    login(client)

    def run(team_path, aliases=None):
        with open(team_path, "rb") as t, open(make_book(tmp_path / "m.xlsx"), "rb") as m:
            p = client.post("/api/import/preview", files={"team": ("t.xlsx", t), "creatives": ("m.xlsx", m)},
                            data={"as_of": "2030-03-25"}).json()
        client.post(f"/api/import/apply/{p['run']}", json={"aliases": aliases(p) if aliases else {}})
        return p, {c["desc"]: c["id"] for c in client.get("/api/bootstrap").json()["db"]["cases"]}

    _, first = run(team_book(tmp_path / "a.xlsx"))
    path = team_book(tmp_path / "b.xlsx", edit={"還沒開始的案子": lambda r: [r[0], "完全不同的新名字 XYZ"] + r[2:]})
    pick = lambda p: {p["diff"]["new"][0]["key"]: p["diff"]["missing"][0]["key"]}
    p, second = run(path, pick)
    assert p["suggestions"] == [] and p["diff"]["counts"]["missing"] == 1 and p["diff"]["new"][0]["g"] == "p"
    assert second["完全不同的新名字 XYZ"] == first["還沒開始的案子"]
    boot = client.get("/api/bootstrap").json()
    assert boot["diff"]["counts"]["missing"] == 0 and boot["diff"]["counts"]["new"] == 0


def test_rebuild_keeps_numbers_and_diff(client, tmp_path):
    import datetime
    from test_import import make_book, team_book
    login(client)

    def run(team_path):
        with open(team_path, "rb") as t, open(make_book(tmp_path / "m.xlsx"), "rb") as m:
            p = client.post("/api/import/preview", files={"team": ("t.xlsx", t), "creatives": ("m.xlsx", m)},
                            data={"as_of": "2030-03-25"}).json()
        client.post(f"/api/import/apply/{p['run']}", json={})

    run(team_book(tmp_path / "a.xlsx"))
    run(team_book(tmp_path / "b.xlsx", extra_row=["FAQ", "新插入的一列", "Pending", datetime.date(2030, 4, 1), "Pending", None, None]))
    before = client.get("/api/bootstrap").json()
    r = client.post("/api/import/rebuild").json()
    after = client.get("/api/bootstrap").json()
    assert r["ok"] and r["changed"] == 0
    assert {c["desc"]: c["id"] for c in before["db"]["cases"]} == {c["desc"]: c["id"] for c in after["db"]["cases"]}
    assert after["diff"]["counts"] == before["diff"]["counts"] and len(client.get("/api/import/runs").json()) == 2
