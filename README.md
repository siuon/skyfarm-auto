# SkyFarm Auto

浮島農場 SkyFarm（`https://phoenixruby.github.io/skyfarm/`）的 Tampermonkey 使用者腳本：自動收成、播種、賣出、澆水、抓蟲、
撿糞便與動物產物、餵動物、清雜物、採果樹、收魚、收機器成品、收蜂箱蜂蜜、長大的肉用動物出貨、扶正歪掉的裝飾。
原則是「成熟了、點一下就收得到的，都收」：設定作物以外的成熟作物也收（只收、不澆水、不賣），
收進倉庫的東西一律只在倉庫放得下時才收。

- `skyfarm-auto.js`：主程式（單一檔案，無相依套件）
- `skyfarm-auto.loader.github.user.js`：GitHub 版載入器（鎖定 commit＋SHA-256，貼進 Tampermonkey 即可）
- `skyfarm-auto.loader.user.js`：本機載入器（`file:///` 路徑，不進版控）

快速鍵：Alt+Shift+A 開關（預設 OFF）、Alt+Shift+S 設定作物、Alt+Shift+D 診斷。功能與設定見 `skyfarm-auto.js` 開頭的說明與 `CONFIG`。

## 對應的官方遊戲版號

測試對應的官方版號記錄在 [`test/GAME_VERSION.json`](test/GAME_VERSION.json)（目前：**2.67-f45aa956bf**）。
它只會在「契約測試對該版號的官方檔案全部通過」之後才更新（`npm run record-version`）。

## 測試

只用 Node 內建功能（需要 Node 22 以上），不需要 `npm install`。

| 指令 | 內容 |
| --- | --- |
| `npm test` | 單元測試（`test/unit`）＋發佈一致性測試（`test/release`），離線可跑 |
| `npm run test:contract` | 下載官方遊戲到 `.cache/game/`，確認腳本依賴的介面、選擇器、設定欄位都還在 |
| `npm run check-version` | 比對官方遊戲目前版號與測試對應的版號；不一致結束碼 1 |
| `npm run mutation` | 突變檢查：把關鍵安全判斷逐一改壞，每個都必須讓測試變紅 |
| `npm run record-version` | 契約測試全過後，記下新的官方版號 |
| `npm run verify` | 全部依序執行 |

測試結構：

- **單元測試**在 vm 沙盒裡執行腳本（只在記憶體副本結尾插入匯出，不改磁碟上的檔案），搭配假時鐘、假 DOM、
  一個模擬遊戲行為的假遊戲（`test/helpers`）。涵蓋：快速鍵與輸入面板、田地決策、賣出流程、動物與餵食、
  果樹魚池機器、地上雜物、各種暫停閘門、錯誤自動關閉、資安靜態檢查、釘住的預設值。
- **契約測試**（`test/contract`）：`contract.js` 列出腳本對官方遊戲的全部依賴；單元測試保證清單等於腳本真實依賴，
  契約測試保證官方遊戲目前還有這些東西。官方遊戲檔案只放在 `.cache/`（已忽略），不進版控。
- **發佈一致性**（`test/release`）：載入器鎖的 commit＋SHA-256 必須和那個 commit 裡的檔案相符、版本號一致。

## 修改流程（重要）

1. **先確認官方版號**：`npm run check-version`。
   - 一致 → 直接做新需求。
   - 不一致（遊戲更新了）→ **先調整測試**：`npm run test:contract` 看哪裡不符，修正 `test/` 內的假遊戲、
     假 DOM、契約清單（必要時再修腳本），再 `npm run record-version` 記下新版號；然後才做新需求。
2. 改程式，同時補測試。
3. **commit 前先用測試驗證**：`git config core.hooksPath tools/hooks` 啟用 pre-commit hook 後，每次 commit 會自動跑
   單元＋發佈一致性測試與版號檢查，沒過就取消。
4. 改了 `skyfarm-auto.js` 就是一次發佈：版本號加一 → 兩個 commit（先推主程式；再把載入器的 commit 與雜湊換成新的）→ push →
   從 GitHub 抓回來驗證雜湊。載入器的雜湊是對 GitHub 上的原始檔算的，所以 `*.js` 一律用 LF（見 `.gitattributes`）。

## 資安原則

腳本在頁面環境執行（`@grant none`），讀得到遊戲存檔，所以：不連網、不用 `innerHTML`/`eval`、不碰儲存空間、
不在 `window` 上留物件、只接受真實按鍵、錯誤時自動關閉、遇到玩家開的視窗／選單／「擴地模式」就暫停、
絕不點農藥／升級。肉用動物只有「長大了」才出貨（遊戲規定長大後放 2 天就會死，所以收掉才對；還沒長大的絕不點）、
蜂箱只點「存著蜂蜜」的（點到空蜂箱會開出玩家的面板）。這些都有對應的測試釘住（`test/unit/09-security.test.js`、
`test/unit/10-collect-all.test.js`），突變檢查也會確認這些判斷被改壞時測試會變紅。

有意不處理的：水井（打水要看水塔剩多少空間，腳本讀不到；也不是收成）、太陽能板擦灰、垃圾站倒垃圾。

另外：腳本一次只處理畫面上的這一座島（擴地滿 4 塊後再擴會開「農場 2」，那是另一張地圖）；有多座島時標籤會提醒，
其他島的雜草、作物都不會動。倉庫裡的雜草到 `weedMaxStock`（40）就不再拔、也不會自動賣；雜草沒拔時標籤會寫是
「倉庫剩 N 格空位」還是「倉庫裡已有 N 個雜草」。遊戲在「擴地模式」時所有點擊都被當成擴地，腳本會暫停到你結束為止。
