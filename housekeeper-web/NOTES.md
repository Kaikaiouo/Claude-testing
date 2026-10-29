# housekeeper 網頁版:開發筆記

給每天接手的 Claude(以及使用者)看的進度板。每次工作前先讀完這份,結束時更新。

## 做法
- 純 HTML/CSS/JS,沒有建置步驟。`core.js` 是無 DOM 的核心邏輯(有測試),`app.js` 是介面,`index.html` 是頁面。
- 資料先存 localStorage,在 Claude Artifact 環境有 `db` 時同步到私人雲端文件 `data/users/<id>/state`(跨裝置)。以 `updatedAt` 較新者為準。
- 與 `../housekeeper-ios/`(SwiftUI 版)共用同樣的資料欄位與規則,網頁版是用來快速驗證設計。
- 測試:`node --test test/*.test.js`

## 里程碑
- [x] M1:新增/編輯/刪除、到期排序與顏色分級、吃完/還原、位置篩選、搜尋、估算到期日、匯出 .ics 行事曆提醒、本機+雲端保存
- [x] 響應式版型:≤360 小手機、手機橫放、≥720 平板兩欄、≥1100 桌機卡片雙欄
- [ ] M2:拍照辨識(用 Artifact 的 `sample` 能力送圖給 Claude,抓出品名/到期日)、條碼
- [ ] M3:統計(浪費率、各類別數量:已完成 ✓)、購物清單(吃完的自動加入補貨:未做)
- [x] 資料備份:設定內可匯出/還原 JSON(逐筆驗證、與現有清單合併)
- [ ] M4:家庭共用(多人同一份清單)、PWA 安裝到手機主畫面

## 待使用者決定的問題
(目前沒有)

## 更新紀錄
- 2026-10-29:建立 M1。15 個核心測試通過。
- 2026-10-29 21:00(台灣時間,約):新增「統計」面板(待處理/已處理/浪費率、類別長條圖)、JSON 備份匯出與還原、處理物品時記錄 outcome(過期後才處理 = wasted);修正 .ics 分號未跳脫的 bug。18 個測試通過,400/1280 寬度深淺色截圖無橫向捲動、無 JS 錯誤。已發布(artifact 版本 3)。

## 給下次的筆記
- `item.outcome`('used'/'wasted')只在新版處理的物品才有;舊資料沒有 outcome 的已處理項目一律算 used。
- 下一步建議:購物清單(吃完 → 加入補貨,可勾選買好)、PWA(manifest + service worker;Artifact 沙盒是否允許要先驗證,不確定就先做提案)、拍照辨識(需 declare sample 能力,發布時要連同 db、user、downloads 一起宣告)。
- 發布流程注意:publish 前要先用 action: read 讀過 core.js、app.js(path/paths),否則會被拒絕。
