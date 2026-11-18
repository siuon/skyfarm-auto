// ==UserScript==
// @name         SkyFarm Auto 載入器（GitHub 版）
// @namespace    skyfarm-auto.github
// @version      0.19.0
// @description  從 GitHub 載入浮島農場 SkyFarm 遊戲輔助；有 SHA-256 校驗，檔案內容和下面的雜湊不符就拒絕載入
// @match        https://phoenixruby.github.io/skyfarm/*
// @require      https://raw.githubusercontent.com/siuon/skyfarm-auto/8e4e9bd1c5f7de6ec8f531d11082605bf959d597/skyfarm-auto.js#sha256=e4bd9ad4d25ab3de126427caa95dbd5275b97a1ed682ca2897b1bc2f44bba9ac
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

// 這是「GitHub 版載入器」：把上方整段貼進 Tampermonkey 新增的腳本即可（或在瀏覽器開啟這個檔案的 raw 網址，
// Tampermonkey 會跳出安裝畫面）。
// 實際功能都在 skyfarm-auto.js（同一個 GitHub 倉庫）；這個載入器只負責「去哪裡抓、怎麼確認沒被改過」。
// 網址鎖的是完整 commit，不是 main：之後再 push 新版，已經安裝好的電腦不會受影響，要更新時照下面的步驟換。
//
// 每次發佈新版的步驟：
//   1. 把 skyfarm-auto.js commit 並 push 到 GitHub，打一個 tag（例如 v0.9.0）或記下 commit 的完整 SHA
//   2. 在 skyfarm-auto.js 所在資料夾算出新的雜湊（PowerShell）：
//        (Get-FileHash skyfarm-auto.js -Algorithm SHA256).Hash.ToLower()
//   3. 把上面 @require 網址裡的 tag/commit 和 #sha256= 後面的雜湊換成新的，@version 加一
//   4. 每台電腦的 Tampermonkey 更新這份載入器（貼上新內容，或用下面的 @updateURL 自動更新）
//
// 想讓各台電腦自動更新載入器：把載入器本身也放進同一個倉庫，並取消下面兩行的註解（網址換成實際的）：
//   // @updateURL    https://raw.githubusercontent.com/siuon/skyfarm-auto/main/skyfarm-auto.loader.github.user.js
//   // @downloadURL  https://raw.githubusercontent.com/siuon/skyfarm-auto/main/skyfarm-auto.loader.github.user.js
// 注意：這樣載入器就由倉庫擁有者（你）全權決定每台電腦跑什麼程式，GitHub 帳號務必開兩步驟驗證。
