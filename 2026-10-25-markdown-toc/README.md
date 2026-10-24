# Markdown 目錄產生器

讀取 Markdown 檔案,自動產生可點擊的目錄 (Table of Contents)。會忽略程式碼區塊內的 `#`,並處理重複標題 (自動加 `-1`、`-2`),支援中文標題。

## 執行方式

只需 Node.js,不需安裝套件:

```bash
node toc.js sample.md        # 預設到第 3 層標題
node toc.js sample.md 2      # 只顯示到第 2 層
node test.js                 # 執行測試
```

## 範例輸出

```
- [專案說明](#專案說明)
  - [安裝](#安裝)
    - [需求](#需求)
  - [使用方式](#使用方式)
  - [安裝](#安裝-1)
    - [進階設定](#進階設定)
```

## 檔案

- `toc.js`:主程式,也可 `require` 使用 `buildToc`
- `test.js`:簡單測試
- `sample.md`:範例輸入
