// ==UserScript==
// @name         SkyFarm Auto 載入器（GitHub 版）
// @namespace    skyfarm-auto.github
// @version      0.9.0
// @description  從 GitHub 載入浮島農場 SkyFarm 遊戲輔助；有 SHA-256 校驗，檔案內容和下面的雜湊不符就拒絕載入
// @match        https://phoenixruby.github.io/skyfarm/*
// @require      https://raw.githubusercontent.com/<GitHub帳號>/<倉庫名>/<tag或commit>/skyfarm-auto.js#sha256=9ea0ef5924b98036ce2a46b62a9bb5fbb1b1483be92cc91078e05de9b6c9c499
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

// 這是「GitHub 版載入器」範本：把上方整段貼進 Tampermonkey 新增的腳本，並把 <> 的部分換成你的實際值。
// 實際功能都在 skyfarm-auto.js（要放進你的 GitHub 倉庫）；這個載入器只負責「去哪裡抓、怎麼確認沒被改過」。
//
// 每次發佈新版的步驟：
//   1. 把 skyfarm-auto.js commit 並 push 到 GitHub，打一個 tag（例如 v0.9.0）或記下 commit 的完整 SHA
//   2. 在 skyfarm-auto.js 所在資料夾算出新的雜湊（PowerShell）：
//        (Get-FileHash skyfarm-auto.js -Algorithm SHA256).Hash.ToLower()
//   3. 把上面 @require 網址裡的 tag/commit 和 #sha256= 後面的雜湊換成新的，@version 加一
//   4. 每台電腦的 Tampermonkey 更新這份載入器（貼上新內容，或用下面的 @updateURL 自動更新）
//
// 想讓各台電腦自動更新載入器：把載入器本身也放進同一個倉庫，並取消下面兩行的註解（網址換成實際的）：
//   // @updateURL    https://raw.githubusercontent.com/<GitHub帳號>/<倉庫名>/<分支>/skyfarm-auto.loader.github.user.js
//   // @downloadURL  https://raw.githubusercontent.com/<GitHub帳號>/<倉庫名>/<分支>/skyfarm-auto.loader.github.user.js
// 注意：這樣載入器就由倉庫擁有者（你）全權決定每台電腦跑什麼程式，GitHub 帳號務必開兩步驟驗證。
