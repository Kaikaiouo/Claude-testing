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
- [x] M2a:拍照辨識(新增表單的「拍照/選圖辨識」,sample 送圖,回傳 JSON 經 `HK.parseScan` 驗證後填入表單)
- [ ] M2b:條碼(尚未做;需查商品資料庫來源,Artifact 網路被封鎖,可能只能靠 sample 讀包裝文字)
- [x] M3:統計(浪費率、各類別數量)、購物清單(吃完後出現「加入購物清單」提示、同名未買合併數量、勾選買好 → 「放入清單」預填表單並估算到期日;備份含購物清單)
- [x] 資料備份:設定內可匯出/還原 JSON(逐筆驗證、與現有清單合併)
- [ ] M4:家庭共用(多人同一份清單)、PWA 安裝到手機主畫面

## 待使用者決定的問題
(目前沒有)

## 更新紀錄
- 2026-10-29:建立 M1。15 個核心測試通過。
- 2026-10-29 21:00(台灣時間,約):新增「統計」面板(待處理/已處理/浪費率、類別長條圖)、JSON 備份匯出與還原、處理物品時記錄 outcome(過期後才處理 = wasted);修正 .ics 分號未跳脫的 bug。18 個測試通過,400/1280 寬度深淺色截圖無橫向捲動、無 JS 錯誤。已發布(artifact 版本 3)。
- 2026-10-29 15:10(UTC;台灣約 23:10):新增購物清單(core.js 的 addShopping/sortShopping/shopToForm、介面面板與提示條、備份/雲端同步含 shopping);窄螢幕標題列按鈕不再折行。20 個測試通過,400/1280 寬度截圖無橫向捲動、無 JS 錯誤。已發布(artifact 版本 4,capabilities 不變)。
- 2026-10-30 約 01:00(台灣時間):新增拍照辨識(core.js 的 scanPrompt/parseScan + 測試、表單內辨識按鈕,無 sample 能力時自動隱藏;看不到日期時改用類別估算並標示估算)。21 個測試通過,400/1280 寬度(以 mock sample 驗證)無橫向捲動、無 JS 錯誤。已發布(artifact 版本 5),capabilities 現為 db、user、downloads、sample{images:true}。
- 2026-10-29 約 22:15(UTC;台灣 10-30 06:15 左右):購物清單依類別分組(core.js 的 groupShopping + 測試)、所有對話框的焦點管理(開啟移入、Tab 不跳出、關閉還原焦點)、「吃完」提示條新增「復原」鈕。22 個測試通過,400/1280 寬度無橫向捲動、無 JS 錯誤。已發布(artifact 版本 6,capabilities 沿用不變)。
- 2026-10-29 約 16:10(UTC;台灣 10-30 00:10):新增重複偵測(core.js 的 findDuplicate + 測試;新增同名同位置未處理物品時,第一次儲存先提醒、再按一次才存)、辨識前顯示所選照片縮圖。23 個測試通過,400/1280 寬度無橫向捲動、無 JS 錯誤。已發布(artifact 版本 7,capabilities 沿用)。
- 2026-10-30 約 14:00(UTC;台灣約 22:00):數量>1 的物品新增「用 1 個」鈕(core.js 的 finishItem + 測試,「吃完」也改走 finishItem)。24 個測試通過,400/1280 寬度無橫向捲動、無 JS 錯誤。已發布(artifact 版本 8,capabilities 沿用)。
- 2026-10-30 約 22:30(UTC;台灣 10-31 06:30 左右):新增「已開封」功能(core.js 的 openedDays/openItem/unopenItem + 測試;編輯物品時按「已開封:縮短到期日」,依類別取保守天數、到期日只提前不延後,清單標示「已開封」,可復原;備份保留 openedAt)。26 個測試通過,400/1280 寬度無橫向捲動、無 JS 錯誤(僅字型連線失敗)。已發布(artifact 版本 9,capabilities 沿用)。

## 給下次的筆記
- 開封天數是保守估計(乳製品 5、飲料 7、調味料 90、肉類 2、蔬菜/水果 3、藥品 30、保養品 180,冷凍不適用),WebSearch 沒找到單一權威表,UI 已標明「以包裝為準」。若使用者想調整,可考慮放進設定。尚未做:列表上的一鍵「開封」鈕(目前只在編輯表單內,避免窄螢幕按鈕擁擠)。
- 「用 1 個」只減數量,不計入統計的已處理/浪費率(部分使用不判定 outcome);整筆吃完才記錄。
- 焦點管理用 MutationObserver 監看 .sheetwrap 的 hidden,新增對話框只要用 .sheetwrap 結構就自動套用。發布時若被拒絕說未讀過線上版本,先 read 後原樣再發一次即可。
- 下一步建議:PWA(manifest/service worker 在 Artifact 沙盒是否可用未驗證)、辨識縮圖預覽與多件商品一次辨識、條碼(M2b)、家庭共用(M4,需使用者決定隱私與帳號模型)。
- 拍照辨識:真實 sample 呼叫無法在這個環境測,只用 mock 驗證流程;用 modelTier 'quick'。日期一律由使用者確認(prompt 要求看不清填 null、不猜)。下次可加:辨識中顯示縮圖預覽、多件商品一次辨識(陣列)。
- 發布 capabilities 現在必須含 sample:{images:true},之後重發要連同 db、user、downloads 一起宣告(或省略 capabilities 沿用)。
- `item.outcome`('used'/'wasted')只在新版處理的物品才有;舊資料沒有 outcome 的已處理項目一律算 used。
- 下一步建議:購物清單(吃完 → 加入補貨,可勾選買好)、PWA(manifest + service worker;Artifact 沙盒是否允許要先驗證,不確定就先做提案)、拍照辨識(需 declare sample 能力,發布時要連同 db、user、downloads 一起宣告)。
- 發布流程注意:publish 前要先用 action: read 讀過 core.js、app.js(path/paths),否則會被拒絕。
- 設計決定:吃完後不自動加入購物清單,改用 6 秒的提示條讓使用者一鍵加入(避免清單被不想補貨的東西塞滿)。`state.shopping` 是新欄位,舊資料自動補 []。
- 下一步建議:PWA(manifest + service worker;Artifact 沙盒是否允許未驗證,先做提案)、拍照辨識(declare sample,需連同 db、user、downloads 一起宣告)、購物清單依類別分組、無障礙檢查(對話框焦點陷阱、Esc 已有)。
