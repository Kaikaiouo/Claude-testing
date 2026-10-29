// 立體四連(Score Four / 3D Connect Four):4x4x4 立方體,16 根柱子,每根可疊 4 顆球。
// 任意方向(橫、直、層內斜、跨層斜、立體對角線)連成 4 顆即獲勝,共 76 條線。
// 走法 = 柱子編號 0~15(peg = y * 4 + x);格子索引 = z * 16 + y * 4 + x,z 為高度。
(function () {
  const U = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./util') : self.BoardAI.util;

  const EMPTY = 0, BLACK = 1, WHITE = -1;
  const cell = (x, y, z) => z * 16 + y * 4 + x;

  // 產生全部 76 條獲勝線:對每個方向向量與起點,檢查是否整條都在立方體內
  const LINES = [];
  const dirs = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    if (!dx && !dy && !dz) continue;
    // 只取「正向」的一半方向,避免同一條線重複
    if (dz < 0 || (dz === 0 && (dy < 0 || (dy === 0 && dx < 0)))) continue;
    dirs.push([dx, dy, dz]);
  }
  for (const [dx, dy, dz] of dirs) {
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
      const ex = x + 3 * dx, ey = y + 3 * dy, ez = z + 3 * dz;
      if (ex < 0 || ex > 3 || ey < 0 || ey > 3 || ez < 0 || ez > 3) continue;
      // 起點必須是這條線的真正端點(往反方向再退一步會出界),否則重複計算
      const bx = x - dx, by = y - dy, bz = z - dz;
      if (bx >= 0 && bx <= 3 && by >= 0 && by <= 3 && bz >= 0 && bz <= 3) continue;
      LINES.push([0, 1, 2, 3].map(k => cell(x + k * dx, y + k * dy, z + k * dz)));
    }
  }
  const LINES_BY_CELL = Array.from({ length: 64 }, () => []);
  LINES.forEach((l, i) => l.forEach(c => LINES_BY_CELL[c].push(i)));

  const T = [0, 1, 9, 80]; // 線上己方球數(對手為 0)對應的分數
  const Z = U.makeZobrist(64, 20261031);
  // 中央柱子較有價值(穿過的線較多),用於走法排序
  const PEG_ORDER = [5, 6, 9, 10, 0, 3, 12, 15, 1, 2, 4, 7, 8, 11, 13, 14];

  class Score4 {
    constructor() {
      this.board = new Int8Array(64);
      this.heights = new Int8Array(16);
      this.player = BLACK;
      this.history = [];
      this.win = 0;
      this.winLine = null;
      this.h1 = 0; this.h2 = 0;
    }

    clone() {
      const g = new Score4();
      g.board = this.board.slice(); g.heights = this.heights.slice();
      g.player = this.player; g.win = this.win; g.winLine = this.winLine;
      g.h1 = this.h1; g.h2 = this.h2;
      g.history = this.history.map(e => ({ ...e }));
      return g;
    }

    hash() { return U.hashKey(this.h1, this.h2); }
    isOver() { return this.win !== 0 || this.history.length === 64; }
    winner() { return this.win !== 0 ? this.win : this.history.length === 64 ? 0 : null; }
    // 柱子 peg 下一顆球會落在的格子索引(滿了為 -1)
    landing(peg) { return this.heights[peg] >= 4 ? -1 : this.heights[peg] * 16 + peg; }

    play(peg) {
      if (this.isOver()) throw new Error('遊戲已結束');
      if (!(peg >= 0 && peg < 16)) throw new Error(`柱子編號超出範圍:${peg}`);
      const idx = this.landing(peg);
      if (idx < 0) throw new Error(`這根柱子已經滿了:${peg}`);
      const p = this.player, k = idx * 2 + (p === BLACK ? 0 : 1);
      this.board[idx] = p; this.heights[peg]++;
      this.h1 ^= Z.a[k] ^ Z.sideA; this.h2 ^= Z.b[k] ^ Z.sideB;
      let won = null;
      for (const li of LINES_BY_CELL[idx]) {
        const l = LINES[li];
        if (this.board[l[0]] === p && this.board[l[1]] === p && this.board[l[2]] === p && this.board[l[3]] === p) { won = l; break; }
      }
      if (won) { this.win = p; this.winLine = won; }
      this.history.push({ move: peg, player: p, cell: idx, won: !!won });
      this.player = -p;
    }

    undo() {
      const e = this.history.pop();
      if (!e) throw new Error('沒有可復原的步');
      const k = e.cell * 2 + (e.player === BLACK ? 0 : 1);
      this.board[e.cell] = EMPTY; this.heights[e.move]--;
      this.h1 ^= Z.a[k] ^ Z.sideA; this.h2 ^= Z.b[k] ^ Z.sideB;
      if (e.won) { this.win = 0; this.winLine = null; }
      this.player = e.player;
    }

    allMoves() {
      if (this.isOver()) return [];
      const out = [];
      for (let p = 0; p < 16; p++) if (this.heights[p] < 4) out.push(p);
      return out;
    }
    legalMoves() { return this.allMoves(); }

    // 若 p 在柱子 peg 落子是否能直接連成四
    completes(peg, p) {
      const idx = this.landing(peg);
      if (idx < 0) return false;
      for (const li of LINES_BY_CELL[idx]) {
        let ok = true;
        for (const c of LINES[li]) if (c !== idx && this.board[c] !== p) { ok = false; break; }
        if (ok) return true;
      }
      return false;
    }

    // 必勝步優先、必擋步其次,其餘中央優先
    searchMoves() {
      const moves = this.allMoves();
      if (moves.length <= 1) return moves;
      const wins = moves.filter(m => this.completes(m, this.player));
      if (wins.length) return wins;
      const blocks = moves.filter(m => this.completes(m, -this.player));
      if (blocks.length) return blocks;
      return PEG_ORDER.filter(m => this.heights[m] < 4);
    }

    terminalScore() { return this.win === 0 ? 0 : this.win === this.player ? 1000000 : -1000000; }

    evaluate() {
      let s = 0;
      for (const l of LINES) {
        let b = 0, w = 0;
        for (const c of l) { const v = this.board[c]; if (v === BLACK) b++; else if (v === WHITE) w++; }
        if (b && !w) s += T[b]; else if (w && !b) s -= T[w];
      }
      return s * this.player;
    }

    static pegToString(p) { return 'ABCD'[p % 4] + ((p / 4 | 0) + 1); }
    static parseMove(s) {
      const m = /^([a-d])([1-4])$/i.exec(String(s).trim());
      if (!m) throw new Error(`無法解析柱子:${s}(格式例如 B3)`);
      return (+m[2] - 1) * 4 + (m[1].toUpperCase().charCodeAt(0) - 65);
    }
    moveToString(m) { return Score4.pegToString(m); }
    parseMove(s) { return Score4.parseMove(s); }
  }

  const api = { Score4, LINES, EMPTY, BLACK, WHITE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (self.BoardAI = self.BoardAI || {}).score4 = api;
})();
