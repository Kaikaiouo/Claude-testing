// 五子棋(自由規則:連成五子或以上即獲勝)。
// 棋盤大小可調(5~19,預設 15),索引 = row * size + col,黑棋先手。
(function () {
  const U = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./util') : self.BoardAI.util;

  const EMPTY = 0, BLACK = 1, WHITE = -1;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  // 五格視窗內「己方棋子數」對應的分數(視窗內不可有對手棋子)
  const T = [0, 1, 10, 100, 1000, 100000];
  const WIN_SCORE = 100000;
  const Z = U.makeZobrist(19 * 19, 20261030);

  class Gomoku {
    constructor(size = 15, maxBranch = 12) {
      if (!(size >= 5 && size <= 19)) throw new Error('棋盤大小需介於 5 到 19');
      this.size = size;
      this.maxBranch = maxBranch;
      this.board = new Int8Array(size * size);
      this.player = BLACK;
      this.history = [];
      this.win = 0;
      this.h1 = 0; this.h2 = 0;
    }

    clone() {
      const g = new Gomoku(this.size, this.maxBranch);
      g.board = this.board.slice();
      g.player = this.player; g.win = this.win;
      g.h1 = this.h1; g.h2 = this.h2;
      g.history = this.history.map(e => ({ ...e }));
      return g;
    }

    hash() { return U.hashKey(this.h1, this.h2); }
    isOver() { return this.win !== 0 || this.history.length === this.size * this.size; }
    winner() { return this.win !== 0 ? this.win : this.history.length === this.size * this.size ? 0 : null; }

    // 以 idx 為中心,沿方向 (dr,dc) 連續同色的棋子數
    _lineLength(idx, p, dr, dc) {
      const n = this.size, r = (idx / n) | 0, c = idx % n;
      let len = 1;
      for (let k = 1; ; k++) { const rr = r + dr * k, cc = c + dc * k; if (rr < 0 || rr >= n || cc < 0 || cc >= n || this.board[rr * n + cc] !== p) break; len++; }
      for (let k = 1; ; k++) { const rr = r - dr * k, cc = c - dc * k; if (rr < 0 || rr >= n || cc < 0 || cc >= n || this.board[rr * n + cc] !== p) break; len++; }
      return len;
    }

    play(idx) {
      if (this.isOver()) throw new Error('遊戲已結束');
      if (!(idx >= 0 && idx < this.size * this.size)) throw new Error(`座標超出範圍:${idx}`);
      if (this.board[idx] !== EMPTY) throw new Error(`該位置已有棋子:${this.moveToString(idx)}`);
      const p = this.player, k = idx * 2 + (p === BLACK ? 0 : 1);
      this.board[idx] = p;
      this.h1 ^= Z.a[k] ^ Z.sideA; this.h2 ^= Z.b[k] ^ Z.sideB;
      let won = false;
      for (const [dr, dc] of DIRS) if (this._lineLength(idx, p, dr, dc) >= 5) { won = true; break; }
      if (won) this.win = p;
      this.history.push({ move: idx, player: p, won });
      this.player = -p;
    }

    undo() {
      const e = this.history.pop();
      if (!e) throw new Error('沒有可復原的步');
      const k = e.move * 2 + (e.player === BLACK ? 0 : 1);
      this.board[e.move] = EMPTY;
      this.h1 ^= Z.a[k] ^ Z.sideA; this.h2 ^= Z.b[k] ^ Z.sideB;
      if (e.won) this.win = 0;
      this.player = e.player;
    }

    allMoves() {
      if (this.isOver()) return [];
      const out = [];
      for (let i = 0; i < this.board.length; i++) if (this.board[i] === EMPTY) out.push(i);
      return out;
    }
    legalMoves() { return this.allMoves(); }

    // 與現有棋子距離 ≤ 2 的空格(空棋盤時回傳天元)
    candidateCells() {
      if (this.isOver()) return [];
      const n = this.size;
      if (!this.history.length) return [((n / 2) | 0) * n + ((n / 2) | 0)];
      const mark = new Uint8Array(n * n), out = [];
      for (const { move } of this.history) {
        const r = (move / n) | 0, c = move % n;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
          const i = rr * n + cc;
          if (!mark[i] && this.board[i] === EMPTY) { mark[i] = 1; out.push(i); }
        }
      }
      return out;
    }

    // 若 p 在 idx 落子,涵蓋 idx 的所有五格視窗所得分數(越大越好)
    cellScore(idx, p) {
      const n = this.size, r = (idx / n) | 0, c = idx % n, b = this.board;
      let total = 0;
      const v = new Int8Array(9);
      for (const [dr, dc] of DIRS) {
        for (let k = -4; k <= 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          v[k + 4] = rr < 0 || rr >= n || cc < 0 || cc >= n ? 2 : b[rr * n + cc];
        }
        for (let s = 0; s <= 4; s++) {
          let cnt = 0, ok = true;
          for (let j = s; j < s + 5; j++) {
            const x = v[j];
            if (x === 2 || x === -p) { ok = false; break; }
            if (x === p || j === 4) cnt++;
          }
          if (ok) total += T[cnt];
        }
      }
      return total;
    }

    // 搜尋用候選步:必勝步 / 必擋步優先,其餘依攻守分數排序並截斷
    searchMoves() {
      const cells = this.candidateCells();
      if (cells.length <= 1) return cells;
      const p = this.player, scored = [], wins = [], blocks = [];
      for (const i of cells) {
        const own = this.cellScore(i, p), opp = this.cellScore(i, -p);
        if (own >= WIN_SCORE) wins.push(i);
        else if (opp >= WIN_SCORE) blocks.push(i);
        scored.push([own + opp * 0.95, i]);
      }
      if (wins.length) return wins;
      if (blocks.length) return blocks;
      scored.sort((x, y) => y[0] - x[0]);
      return scored.slice(0, this.maxBranch).map(x => x[1]);
    }

    terminalScore() {
      return this.win === 0 ? 0 : this.win === this.player ? 1000000 : -1000000;
    }

    // 全盤五格視窗掃描,從「輪到的玩家」角度
    evaluate() {
      const n = this.size, b = this.board;
      let black = 0, white = 0;
      for (const [dr, dc] of DIRS) {
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          const er = r + dr * 4, ec = c + dc * 4;
          if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
          let bc = 0, wc = 0;
          for (let k = 0; k < 5; k++) { const x = b[(r + dr * k) * n + c + dc * k]; if (x === BLACK) bc++; else if (x === WHITE) wc++; }
          if (bc && !wc) black += T[bc]; else if (wc && !bc) white += T[wc];
        }
      }
      return (black - white) * this.player;
    }

    moveToString(m) { return 'ABCDEFGHJKLMNOPQRS'[m % this.size] + (((m / this.size) | 0) + 1); }

    parseMove(s) {
      const m = /^([a-hj-s])(\d{1,2})$/i.exec(String(s).trim());
      if (!m) throw new Error(`無法解析座標:${s}(格式例如 H8,不含字母 I)`);
      const col = 'ABCDEFGHJKLMNOPQRS'.indexOf(m[1].toUpperCase()), row = +m[2] - 1;
      if (col >= this.size || row < 0 || row >= this.size) throw new Error(`座標超出棋盤:${s}`);
      return row * this.size + col;
    }

    toString() {
      const n = this.size, last = this.history.length ? this.history[this.history.length - 1].move : -1;
      let s = '   ' + Array.from({ length: n }, (_, c) => 'ABCDEFGHJKLMNOPQRS'[c]).join(' ') + '\n';
      for (let r = 0; r < n; r++) {
        s += String(r + 1).padStart(2) + ' ';
        for (let c = 0; c < n; c++) {
          const i = r * n + c, v = this.board[i];
          s += (v === BLACK ? 'X' : v === WHITE ? 'O' : '.') + (i === last ? '*' : ' ');
        }
        s += '\n';
      }
      return s + `輪到:${this.player === BLACK ? 'X 黑' : 'O 白'}(* 為最後一手)`;
    }
  }

  const api = { Gomoku, EMPTY, BLACK, WHITE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (self.BoardAI = self.BoardAI || {}).gomoku = api;
})();
