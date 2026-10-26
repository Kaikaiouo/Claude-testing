// 踩地雷核心邏輯(可在瀏覽器與 Node 使用)
function createBoard(rows, cols, mines, safeR, safeC, rng = Math.random) {
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, open: false, flag: false, n: 0 })));
  const pool = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue; // 第一步周圍保證安全
    pool.push([r, c]);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  pool.slice(0, mines).forEach(([r, c]) => (cells[r][c].mine = true));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let n = 0;
    forNeighbors(rows, cols, r, c, (rr, cc) => { if (cells[rr][cc].mine) n++; });
    cells[r][c].n = n;
  }
  return cells;
}
function forNeighbors(rows, cols, r, c, fn) {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) fn(rr, cc);
  }
}
// 翻開格子,回傳 'mine' | 'ok'
function openCell(cells, r, c) {
  const rows = cells.length, cols = cells[0].length;
  const cell = cells[r][c];
  if (cell.open || cell.flag) return 'ok';
  if (cell.mine) { cell.open = true; return 'mine'; }
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const x = cells[cr][cc];
    if (x.open || x.flag) continue;
    x.open = true;
    if (x.n === 0) forNeighbors(rows, cols, cr, cc, (a, b) => { if (!cells[a][b].open) stack.push([a, b]); });
  }
  return 'ok';
}
function isWon(cells) {
  return cells.every(row => row.every(x => x.mine || x.open));
}
if (typeof module !== 'undefined') module.exports = { createBoard, openCell, isWon };
