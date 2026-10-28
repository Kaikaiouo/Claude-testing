#!/usr/bin/env node
// 日期計算器:算天數差、加減日期、星期幾、倒數、年度進度
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

function parse(s) {
  if (s === 'today') {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) throw new Error(`日期格式錯誤:${s}(請用 YYYY-MM-DD 或 today)`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3])
    throw new Error(`不存在的日期:${s}`);
  return d;
}
const fmt = d => d.toISOString().slice(0, 10);
const weekday = d => '星期' + WEEK[d.getUTCDay()];
const diffDays = (a, b) => Math.round((b - a) / 86400000);
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function yearProgress(d) {
  const y = d.getUTCFullYear();
  const day = diffDays(new Date(Date.UTC(y, 0, 1)), d) + 1;
  const total = isLeap(y) ? 366 : 365;
  return { day, total, pct: (day / total) * 100 };
}

function run(argv) {
  const [cmd, ...a] = argv;
  switch (cmd) {
    case 'diff': {
      const x = parse(a[0]), y = parse(a[1]);
      const n = diffDays(x, y);
      return `${fmt(x)} → ${fmt(y)}:${n} 天(約 ${(n / 7).toFixed(1)} 週)`;
    }
    case 'add': {
      const x = parse(a[0]), n = parseInt(a[1], 10);
      if (Number.isNaN(n)) throw new Error('天數必須是整數');
      const r = addDays(x, n);
      return `${fmt(x)} ${n >= 0 ? '+' : '-'} ${Math.abs(n)} 天 = ${fmt(r)}(${weekday(r)})`;
    }
    case 'weekday': {
      const x = parse(a[0]);
      return `${fmt(x)} 是${weekday(x)}`;
    }
    case 'countdown': {
      const t = parse(a[0]), now = parse('today');
      const n = diffDays(now, t);
      return n >= 0 ? `距離 ${fmt(t)} 還有 ${n} 天` : `${fmt(t)} 已經過了 ${-n} 天`;
    }
    case 'progress': {
      const x = parse(a[0] || 'today');
      const p = yearProgress(x);
      const bar = '█'.repeat(Math.round(p.pct / 5)).padEnd(20, '░');
      return `${fmt(x)} 是 ${x.getUTCFullYear()} 年第 ${p.day}/${p.total} 天\n[${bar}] ${p.pct.toFixed(1)}%`;
    }
    default:
      return [
        '用法:node datecalc.js <指令>',
        '  diff <起> <迄>        算相差天數',
        '  add <日期> <天數>      加減天數(可為負)',
        '  weekday <日期>        查星期幾',
        '  countdown <日期>      距今倒數',
        '  progress [日期]       當年度進度',
      ].join('\n');
  }
}

module.exports = { parse, diffDays, addDays, isLeap, yearProgress, run };

if (require.main === module) {
  try { console.log(run(process.argv.slice(2))); }
  catch (e) { console.error('錯誤:' + e.message); process.exit(1); }
}
