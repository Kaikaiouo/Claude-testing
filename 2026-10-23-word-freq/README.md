# 詞頻統計工具 (word-freq)

用 Node.js 寫的命令列小工具,統計文字中出現最多的英文單字與中文字,並以長條圖顯示。不需安裝任何套件。

## 執行方式

```bash
node wordfreq.js sample.txt --top 5
cat sample.txt | node wordfreq.js --min-len 3
node test.js   # 執行測試
```

參數:
- `--top N`:顯示前 N 名(預設 10)
- `--min-len N`:英文單字最短長度(預設 1)

## 範例輸出

```
總詞數: 27,不重複: 21
the          4 ████
dog          2 ██
fox          2 ██
天            2 ██
brown        1 █
```
