#!/usr/bin/env node
// 為 Markdown 檔案產生目錄 (Table of Contents)
const fs = require('fs');

function slugify(text) {
  return text.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function buildToc(md, maxLevel = 3) {
  const seen = {};
  const lines = [];
  let inCode = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (!m || m[1].length > maxLevel) continue;
    const level = m[1].length;
    let slug = slugify(m[2]);
    seen[slug] = (seen[slug] ?? -1) + 1;
    if (seen[slug] > 0) slug += '-' + seen[slug];
    lines.push({ level, title: m[2], slug });
  }
  if (!lines.length) return '';
  const base = Math.min(...lines.map(l => l.level));
  return lines.map(l => `${'  '.repeat(l.level - base)}- [${l.title}](#${l.slug})`).join('\n');
}

module.exports = { buildToc, slugify };

if (require.main === module) {
  const file = process.argv[2];
  const depth = parseInt(process.argv[3] || '3', 10);
  if (!file) { console.error('用法: node toc.js <檔案.md> [最大層級=3]'); process.exit(1); }
  console.log(buildToc(fs.readFileSync(file, 'utf8'), depth));
}
