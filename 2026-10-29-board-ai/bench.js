// 效能基準:各深度的搜尋時間與節點數。執行:node bench.js
const { Othello } = require('./src/othello');
const { Gomoku } = require('./src/gomoku');
const { search } = require('./src/search');
const { mulberry32 } = require('./src/util');

function row(label, g, depths) {
  for (const d of depths) {
    const t = Date.now(), r = search(g, { depth: d });
    const ms = Date.now() - t;
    console.log(`${label.padEnd(14)} 深度 ${d}  ${String(ms).padStart(6)} ms  ${String(r.nodes).padStart(8)} 節點  ${ms ? Math.round(r.nodes / ms) : '-'} 節點/ms`);
  }
}
const rng = mulberry32(2026);
const mid = new Othello();
for (let i = 0; i < 20; i++) { const m = mid.legalMoves(); mid.play(m[Math.floor(rng() * m.length)]); }
row('黑白棋 開局', new Othello(), [4, 6, 8]);
row('黑白棋 中盤', mid, [4, 6, 8]);
const gk = new Gomoku(15);
for (const m of ['H8', 'I8', 'H9', 'G7', 'J10', 'I9']) gk.play(gk.parseMove(m.replace('I', 'J').replace('J10', 'K10')));
row('五子棋 15x15', gk, [2, 3, 4, 5]);
