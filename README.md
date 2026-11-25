# 行銷案件生命跡象觀測中心

把團隊平常填的兩份 Excel（企劃週追蹤表、製作需求總表）變成一個可以看全貌的站：
哪些案件還活著、卡在哪個階段、多久沒有進度，並且每案附一句正經又好笑的評語。

Excel 仍然是資料來源，大家照常填。管理者每週把檔案上傳，站上會先顯示和上一次的差異，確認後才更新。

## 這個版本能做什麼

- **匯入 Excel**：上傳後先預覽差異（新案、結案、狀態變動、期限延後、不見的案件），按套用才生效。
- **案號不會跑掉**：Excel 的列沒有編號，系統用「來源＋描述」認案。插入或刪除列不影響其他案件的案號；描述被改過的案件會列出來讓你確認是不是同一筆。
- **總覽、清冊、週報**：圖表、篩選、每位企劃的週報。
- **站上才有的資料會保存**：評語、母子案連結、自訂欄位、分類對照、補填的開單日、手動的結案判定。
- **兩種帳號**：管理者可以做所有事；其他帳號只能看。
- **API 評語**：還沒有評語的案件可以交給 Claude API 逐案寫（需要設定金鑰）。

## 判讀規則

| 情況 | 判定 |
|---|---|
| 狀態寫了「完成／結案／已上線」等，而且不是「完成，待上傳」這類還在等的 | 結案 |
| 週表裡這一列被隱藏 | 結案（標示「依隱藏列認定」），可在案件內頁改回列管中 |
| 週表的工作表被隱藏 | 視為已離開的企劃，案件只留在清冊當歷史 |
| 當週空白 | 當成沒有進度 |
| 狀態含「暫緩／暫停」 | 不算逾期，標示暫緩 |
| 製作需求表的日期年份明顯打錯 | 當作沒填 |

時間長度在企劃端用「週」算（照日曆，10/29 到 11/19 是四週）；製作單有日期，用工作日算。

製作需求總表只讀名稱符合「年度 + Design／Video／Coding／Support／UI Design（+ 結案）」的工作表，以及「年度 結案」，備份用的工作表會被略過。

## 在自己電腦上跑

需要 Python 3.11 以上。

```bash
cd backend
pip install -r requirements.txt
export ADMIN_USER=admin ADMIN_PASSWORD='換成你的密碼' SECRET_KEY='一長串隨機字元'
uvicorn app.main:app --reload
```

打開 http://localhost:8000 ，用上面的帳號登入，到「管理」上傳兩份 Excel。
沒有設定 `DATABASE_URL` 時，資料存在 `backend/data/case-vitals.db`。

跑測試（測試用程式產生的假 Excel，不含真實資料）：

```bash
cd backend && pip install pytest httpx && pytest
```

## 部署

整個站是一個服務加一個資料庫，用根目錄的 `Dockerfile` 就能在 Railway、Render、Fly.io 這類平台上跑。

1. 建一個 PostgreSQL，把連線字串設成環境變數 `DATABASE_URL`。
2. 設定 `ADMIN_USER`、`ADMIN_PASSWORD`、`SECRET_KEY`，並把 `HTTPS_ONLY` 設成 `1`。
3. 要用 API 寫評語時，再設定 `ANTHROPIC_API_KEY`。
4. 部署後登入，到「管理」匯入 Excel。

所有環境變數的說明在 `.env.example`。

## 資料安全

這個版本庫是公開的，所以請遵守：

- **不要把 Excel、資料庫檔、`.env`、設定檔（seed）放進版本庫**。`.gitignore` 已經擋掉這些副檔名，但 `git add -f` 仍然擋不住。
- 程式裡不放任何人名或案件名稱；企劃的名字是從 Excel 的工作表名稱讀出來的。
- API 金鑰只放在伺服器的環境變數。

## 已知限制

- 「人與人的比較」圖表目前只是在唯讀帳號的畫面上隱藏。唯讀帳號拿到的資料和管理者相同，懂技術的人仍然可以自己算出來。要真正隔離，需要讓伺服器依角色回傳不同資料。
- 評語、連結、自訂欄位是整包儲存的，設計上只有一位管理者在編輯。
- 階段（設計階段、Coding 階段、等對方等）是用狀態文字的關鍵字判讀的，可能誤判。
- 產生 API 評語時如果伺服器重啟，那一批要重新按一次。

## 程式結構

```
backend/app/
  rules.py             狀態怎麼讀、案件指紋
  excel_team.py        解析企劃週追蹤表（含隱藏列、隱藏工作表）
  excel_creatives.py   解析製作需求總表
  snapshot.py          整理成一份快照與圖表統計
  diffing.py           兩次匯入的差異、改名案件的配對建議
  store.py             資料庫
  auth.py              帳號與權限
  commentary.py        Claude API 評語
  main.py              API
backend/tests/         測試
frontend/              畫面（index.html、app.js、manage.js、login.html）
```
