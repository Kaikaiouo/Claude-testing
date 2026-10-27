# housekeeper(iOS)

家中所有會到期的東西(食物、藥品、保養品…)的到期管理 App。完整設計請見設計文件。

## 目前進度:里程碑 1
- 新增 / 編輯 / 刪除物品(名稱、類別、數量、存放位置與溫度、購買日、製造日期、到期日、備註)
- 依到期日排序,顏色標示(紅:已過期、橘:3 天內、黃:7 天內、綠:安全)
- 左滑「刪除」、右滑「吃完」
- 到期前 N 天與到期當天的本機通知(設定頁可調天數與時間)

尚未做:拍照 / 條碼辨識、營養與保存資訊、Widget、統計。

## ⚠️ 注意
這些程式碼是在沒有 Xcode 的環境寫的,**尚未編譯過**。第一次建置可能有小錯誤,請把 Xcode 的錯誤訊息貼給 Claude 修正。

## 在 Mac 上建立專案(約 10 分鐘)
需求:Mac、Xcode 15 以上(SwiftData 需要 iOS 17)。

1. 把這個儲存庫 clone 下來:
   ```bash
   git clone https://github.com/Kaikaiouo/Claude-testing.git
   ```
2. 開啟 Xcode → File → New → Project → iOS → **App** → Next。
3. Product Name 填 `Housekeeper`;Interface 選 **SwiftUI**;Language 選 **Swift**;Storage 選 **None**(我們自己用程式碼設定 SwiftData);Next 後選一個地方儲存。
4. 在 Xcode 左側刪掉自動產生的 `ContentView.swift` 和 `HousekeeperApp.swift`(選 Move to Trash)。
5. 把本資料夾 `Housekeeper/` 裡的 6 個 `.swift` 檔拖進 Xcode 左側專案資料夾,勾選 **Copy items if needed** 與 target Housekeeper。
6. 上方選一個 iPhone 模擬器(iOS 17 以上),按 ▶ 執行。
7. 測試通知:新增一個今天到期的物品,把 App 退到背景,等到提醒時間。想快速測試,可在設定把提醒時間調成下一個整點。通知請盡量用真機測試。

## 檔案說明
| 檔案 | 作用 |
| --- | --- |
| `HousekeeperApp.swift` | App 進入點,設定 SwiftData |
| `Item.swift` | 資料模型、類別與位置列舉、剩餘天數計算 |
| `ContentView.swift` | 主清單頁、滑動操作、重新排程通知 |
| `ItemFormView.swift` | 新增 / 編輯表單 |
| `SettingsView.swift` | 提醒天數與時間設定 |
| `NotificationManager.swift` | 本機通知排程(iOS 上限 64 則,只排最近 60 則) |
