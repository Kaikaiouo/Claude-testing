# 密碼產生器與強度檢查工具

純 Python 標準函式庫,無需安裝任何套件。使用 `secrets` 模組產生密碼學安全的隨機結果。

## 功能
- `gen`:產生隨機密碼(每類字元至少一個),並顯示熵與強度
- `phrase`:產生易記的單字密語
- `check`:估算任意密碼的熵與強度(弱/普通/強/非常強)

## 執行
```bash
python3 passtool.py gen -l 12 -n 2
python3 passtool.py gen --no-symbols
python3 passtool.py phrase -w 4
python3 passtool.py check 'MyPassw0rd!'
```

## 範例輸出
```
$ python3 passtool.py gen -l 12 -n 2
VT07@+cr+cmY  (79 bits, 強)
)Xg#kz81^VcC  (79 bits, 強)

$ python3 passtool.py phrase
pebble-canyon-island-rocket

$ python3 passtool.py check password
熵約 10.0 bits,強度:弱
```

> 熵僅為粗略估計,不代表絕對安全。
