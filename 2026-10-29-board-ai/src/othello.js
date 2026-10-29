// 黑白棋(Othello / Reversi)規則與評估函式。
// 棋盤 8x8,索引 = row * 8 + col,黑棋先手;PASS(64)代表無子可下而跳過。
(function () {
  const U = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./util') : self.BoardAI.util;

  const EMPTY = 0, BLACK = 1, WHITE = -1, PASS = 64, N = 8;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  // RAYS[idx] = 八個方向上,由近到遠的格子索引
  const RAYS = [];
  for (let i = 0; i < 64; i++) {
    const r = (i / 8) | 0, c = i % 8, rays = [];
    for (const [dr, dc] of DIRS) {
      const ray = [];
      for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) ray.push(rr * 8 + cc);
      if (ray.length) rays.push(ray);
    }
    RAYS.push(rays);
  }

  // 位置權重:角落最有價值,角落旁的 X/C 位置危險
  const WEIGHT = [
    100, -20, 10, 5, 5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
    10, -2, -1, -1, -1, -1, -2, 10,
    5, -2, -1, -1, -1, -1, -2, 5,
    5, -2, -1, -1, -1, -1, -2, 5,
    10, -2, -1, -1, -1, -1, -2, 10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10, 5, 5, 10, -20, 100,
  ];
  // 角落 -> 其相鄰的 X/C 格;角落被佔據後這些格子不再危險
  const CORNER_NEIGHBORS = { 0: [1, 8, 9], 7: [6, 14, 15], 56: [48, 49, 57], 63: [54, 55, 62] };
  const Z = U.makeZobrist(64, 20261029);

  class Othello {
    constructor() {
      this.board = new Int8Array(64);
      this.board[27] = WHITE; this.board[28] = BLACK;
      this.board[35] = BLACK; this.board[36] = WHITE;
      this.player = BLACK;
      this.history = [];
      this.h1 = 0; this.h2 = 0;
      this._rehash();
    }

    static fromArray(cells, player = BLACK) {
      if (cells.length !== 64) throw new Error('棋盤必須有 64 格');
      const g = new Othello();
      g.board = Int8Array.from(cells);
      g.player = player;
      g._rehash();
      return g;
    }

    _rehash() {
      let h1 = 0, h2 = 0;
      for (let i = 0; i < 64; i++) {
        const v = this.board[i];
        if (v !== EMPTY) { const k = i * 2 + (v === BLACK ? 0 : 1); h1 ^= Z.a[k]; h2 ^= Z.b[k]; }
      }
      if (this.player === WHITE) { h1 ^= Z.sideA; h2 ^= Z.sideB; }
      this.h1 = h1; this.h2 = h2;
    }

    clone() {
      const g = new Othello();
      g.board = this.board.slice();
      g.player = this.player;
      g.h1 = this.h1; g.h2 = this.h2;
      return g;
    }

    hash() { return U.hashKey(this.h1, this.h2); }

    // 在 idx 落子 p 色會翻轉的格子
    flipsFor(idx, p) {
      const out = [];
      if (this.board[idx] !== EMPTY) return out;
      for (const ray of RAYS[idx]) {
        let k = 0;
        while (k < ray.length && this.board[ray[k]] === -p) k++;
        if (k > 0 && k < ray.length && this.board[ray[k]] === p) for (let j = 0; j < k; j++) out.push(ray[j]);
      }
      return out;
    }

    _movesFor(p) {
      const moves = [];
      for (let i = 0; i < 64; i++) if (this.board[i] === EMPTY && this.flipsFor(i, p).length) moves.push(i);
      return moves;
    }

    countMoves(p) { return this._movesFor(p).length; }

    // 合法步;若當前玩家無步但對手有,回傳 [PASS];雙方皆無則為空(遊戲結束)
    legalMoves() {
      const mine = this._movesFor(this.player);
      if (mine.length) return mine;
      return this._movesFor(-this.player).length ? [PASS] : [];
    }

    // 供搜尋使用:依位置權重排序(角落優先),提升剪枝效率
    searchMoves() {
      const m = this.legalMoves();
      if (m.length > 1) m.sort((a, b) => WEIGHT[b] - WEIGHT[a]);
      return m;
    }

    allMoves() { return this.legalMoves(); }

    isOver() { return !this._movesFor(this.player).length && !this._movesFor(-this.player).length; }

    play(move) {
      if (move === PASS) {
        if (this._movesFor(this.player).length) throw new Error('有合法步時不能 PASS');
        this.history.push({ move, flipped: [], player: this.player });
      } else {
        if (!(move >= 0 && move < 64)) throw new Error(`座標超出範圍:${move}`);
        const flipped = this.flipsFor(move, this.player);
        if (!flipped.length) throw new Error(`非法步:${Othello.moveToString(move)}`);
        const own = this.player === BLACK ? 0 : 1, opp = 1 - own;
        this.board[move] = this.player;
        this.h1 ^= Z.a[move * 2 + own]; this.h2 ^= Z.b[move * 2 + own];
        for (const f of flipped) {
          this.board[f] = this.player;
          this.h1 ^= Z.a[f * 2 + opp] ^ Z.a[f * 2 + own];
          this.h2 ^= Z.b[f * 2 + opp] ^ Z.b[f * 2 + own];
        }
        this.history.push({ move, flipped, player: this.player });
      }
      this.player = -this.player;
      this.h1 ^= Z.sideA; this.h2 ^= Z.sideB;
    }

    undo() {
      const e = this.history.pop();
      if (!e) throw new Error('沒有可復原的步');
      this.player = e.player;
      this.h1 ^= Z.sideA; this.h2 ^= Z.sideB;
      if (e.move !== PASS) {
        const own = e.player === BLACK ? 0 : 1, opp = 1 - own;
        this.board[e.move] = EMPTY;
        this.h1 ^= Z.a[e.move * 2 + own]; this.h2 ^= Z.b[e.move * 2 + own];
        for (const f of e.flipped) {
          this.board[f] = -e.player;
          this.h1 ^= Z.a[f * 2 + opp] ^ Z.a[f * 2 + own];
          this.h2 ^= Z.b[f * 2 + opp] ^ Z.b[f * 2 + own];
        }
      }
    }

    counts() {
      let black = 0, white = 0;
      for (let i = 0; i < 64; i++) { if (this.board[i] === BLACK) black++; else if (this.board[i] === WHITE) white++; }
      return { black, white };
    }

    // 未結束 -> null;結束 -> BLACK / WHITE / 0(平手)
    winner() {
      if (!this.isOver()) return null;
      const { black, white } = this.counts();
      return black > white ? BLACK : white > black ? WHITE : 0;
    }

    // 終局分數,從「輪到的玩家」角度:勝 > 0、負 < 0
    terminalScore() {
      const { black, white } = this.counts();
      const diff = (black - white) * this.player;
      return diff > 0 ? 100000 + diff : diff < 0 ? -100000 + diff : 0;
    }

    // 啟發式評估,從「輪到的玩家」角度
    evaluate() {
      const p = this.player, b = this.board;
      let pos = 0, mine = 0, theirs = 0, empties = 0;
      for (let i = 0; i < 64; i++) {
        const v = b[i];
        if (v === EMPTY) { empties++; continue; }
        let w = WEIGHT[i];
        if (w < 0) {
          // 若相鄰角落已被佔據,該格不再危險
          for (const corner of [0, 7, 56, 63]) {
            if (b[corner] !== EMPTY && CORNER_NEIGHBORS[corner].includes(i)) { w = 3; break; }
          }
        }
        if (v === p) { pos += w; mine++; } else { pos -= w; theirs++; }
      }
      const mm = this.countMoves(p), om = this.countMoves(-p);
      let score = pos + 10 * (mm - om);
      if (mm + om > 0) score += (60 * (mm - om)) / (mm + om);
      if (empties <= 12) score += 12 * (mine - theirs); // 殘局重視棋子數
      return score;
    }

    static moveToString(m) { return m === PASS ? 'pass' : 'abcdefgh'[m % 8] + ((m / 8 | 0) + 1); }

    static parseMove(s) {
      s = String(s).trim().toLowerCase();
      if (s === 'pass') return PASS;
      const m = /^([a-h])([1-8])$/.exec(s);
      if (!m) throw new Error(`無法解析座標:${s}(格式例如 d3)`);
      return (+m[2] - 1) * 8 + (m[1].charCodeAt(0) - 97);
    }

    toString(showHints = true) {
      const legal = showHints ? new Set(this.legalMoves()) : new Set();
      let s = '  a b c d e f g h\n';
      for (let r = 0; r < 8; r++) {
        s += (r + 1) + ' ';
        for (let c = 0; c < 8; c++) {
          const v = this.board[r * 8 + c];
          s += (v === BLACK ? '●' : v === WHITE ? '○' : legal.has(r * 8 + c) ? '·' : ' ') + ' ';
        }
        s += '\n';
      }
      const { black, white } = this.counts();
      return s + `● ${black}  ○ ${white}  輪到:${this.player === BLACK ? '● 黑' : '○ 白'}`;
    }
  }

  const api = { Othello, EMPTY, BLACK, WHITE, PASS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (self.BoardAI = self.BoardAI || {}).othello = api;
})();
