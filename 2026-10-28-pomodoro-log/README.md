# 番茄鐘紀錄器 (pomodoro-log)

命令列番茄鐘:計時、記錄專注時段到 `pomodoro_log.json`,並可查看統計。只用 Python 標準函式庫,不需安裝。

## 執行

```bash
python3 pomodoro.py start 寫程式          # 專注 25 分鐘並記錄
python3 pomodoro.py start 閱讀 -m 50      # 自訂分鐘數
python3 pomodoro.py add 運動 -m 30        # 手動補記
python3 pomodoro.py stats                 # 查看統計
```

可用環境變數 `POMODORO_LOG` 指定紀錄檔位置;`--speed 60` 可加速計時(測試用)。

## 範例輸出

```
總番茄數:3  總分鐘:56
今天:56 分鐘  近 7 天:56 分鐘
各任務:
  閱讀           ██████ 30 分
  寫程式          █████ 26 分
```
