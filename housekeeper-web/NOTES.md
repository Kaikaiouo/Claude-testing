# housekeeper 網頁版:開發筆記

給每天接手的 Claude(以及使用者)看的進度板。每次工作前先讀完這份,結束時更新。

## 做法
- 純 HTML/CSS/JS,沒有建置步驟。`core.js` 是無 DOM 的核心邏輯(有測試),`app.js` 是介面,`index.html` 是頁面。
- 資料先存 localStorage,在 Claude Artifact 環境有 `db` 時同步到私人雲端文件 `data/users/<id>/state`(跨裝置)。以 `updatedAt` 較新者為準。
- 與 `../housekeeper-ios/`(SwiftUI 版)共用同樣的資料欄位與規則,網頁版是用來快速驗證設計。
- 測試:`node --test test/*.test.js`

## 里程碑
- [x] M1:新增/編輯/刪除、到期排序與顏色分級、吃完/還原、位置篩選、搜尋、估算到期日、匯出 .ics 行事曆提醒、本機+雲端保存
- [ ] M2:拍照辨識(用 Artifact 的 `sample` 能力送圖給 Claude,抓出品名/到期日)、條碼
- [ ] M3:統計(浪費率、各類別數量)、購物清單(吃完的自動加入補貨)
- [ ] M4:家庭共用(多人同一份清單)、PWA 安裝到手機主畫面

## 待使用者決定的問題
(目前沒有)

## 更新紀錄
- 2026-10-29:建立 M1。15 個核心測試通過。
