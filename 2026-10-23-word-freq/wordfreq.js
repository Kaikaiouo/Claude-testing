#!/usr/bin/env node
// 文字詞頻統計工具:支援英文單字與中文字元,從檔案或標準輸入讀取
const fs = require('fs');

function parseArgs(argv) {
  const opts = { top: 10, minLen: 1, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--top') opts.top = parseInt(argv[++i], 10);
    else if (argv[i] === '--min-len') opts.minLen = parseInt(argv[++i], 10);
    else opts.file = argv[i];
  }
  return opts;
}

function count(text, minLen) {
  const freq = new Map();
  const add = (w) => freq.set(w, (freq.get(w) || 0) + 1);
  for (const w of text.toLowerCase().match(/[a-z']+/g) || []) {
    if (w.length >= minLen) add(w);
  }
  for (const ch of text.match(/[一-鿿]/g) || []) add(ch);
  return freq;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const text = fs.readFileSync(opts.file || 0, 'utf8');
  const freq = count(text, opts.minLen);
  const total = [...freq.values()].reduce((a, b) => a + b, 0);
  const rows = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, opts.top);
  console.log(`總詞數: ${total},不重複: ${freq.size}`);
  for (const [w, n] of rows) {
    console.log(`${w.padEnd(10)} ${String(n).padStart(3)} ${'█'.repeat(n)}`);
  }
}

if (require.main === module) main();
module.exports = { count };
