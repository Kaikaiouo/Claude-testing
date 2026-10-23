# 單位換算工具 (unit-converter)

用 Python 3 寫的命令列單位換算小工具,支援長度、重量、溫度、容量,包含台尺、台斤。只用標準函式庫,不需安裝套件。

## 執行方式

```bash
python3 unitconv.py <數值> <來源單位> <目標單位>
python3 -m unittest -v   # 執行測試
```

支援單位:
- 長度:mm, cm, m, km, in, ft, yd, mi, 台尺
- 重量:mg, g, kg, oz, lb, 台斤
- 容量:ml, l, gal, cup
- 溫度:c, f, k

## 範例輸出

```
$ python3 unitconv.py 10 km mi
10 km = 6.2137 mi
$ python3 unitconv.py 100 c f
100 c = 212 f
$ python3 unitconv.py 2 台斤 kg
2 台斤 = 1.2 kg
$ python3 unitconv.py 1 kg km
錯誤: 無法從 kg 換算到 km(單位未知或類別不同)
```
