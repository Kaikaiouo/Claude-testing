const assert = require('assert');
const { createBoard, openCell, isWon } = require('./core');
// 固定亂數,確認地雷數量與首步安全
const b = createBoard(9, 9, 10, 4, 4, () => 0.42);
assert.strictEqual(b.flat().filter(x => x.mine).length, 10);
for (let r = 3; r <= 5; r++) for (let c = 3; c <= 5; c++) assert(!b[r][c].mine);
assert.strictEqual(openCell(b, 4, 4), 'ok');
assert(b[4][4].open);
// 踩雷
const m = b.flat().findIndex(x => x.mine);
assert.strictEqual(openCell(b, Math.floor(m / 9), m % 9), 'mine');
// 勝利判定:翻開所有非雷格
const w = createBoard(9, 9, 10, 0, 0);
w.forEach((row, r) => row.forEach((x, c) => { if (!x.mine) openCell(w, r, c); }));
assert(isWon(w));
// 鄰近數字正確
const t = createBoard(5, 5, 3, 2, 2);
t.forEach((row, r) => row.forEach((x, c) => {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
    if ((dr || dc) && t[r + dr]?.[c + dc]?.mine) n++;
  assert.strictEqual(x.n, n);
}));
console.log('所有測試通過 ✅');
