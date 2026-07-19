/* ============================================================
   MOTEUR D'ÉCHECS AUTONOME (remplace la dépendance chess.js/CDN)
   Fournit les mêmes méthodes que celles utilisées par script.js :
   board, get, turn, fen, load, moves, move, game_over, in_check,
   in_checkmate, in_draw, in_stalemate, insufficient_material.
   Aucune connexion réseau requise : tout est calculé localement.
   ============================================================ */
(function () {
  "use strict";

  const WHITE = "w", BLACK = "b";
  const FILES = "abcdefgh";
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  const KNIGHT_OFFS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KING_OFFS   = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const ROOK_DIRS   = [[-1,0],[1,0],[0,-1],[0,1]];
  const QUEEN_DIRS  = BISHOP_DIRS.concat(ROOK_DIRS);

  function opponent(color) { return color === WHITE ? BLACK : WHITE; }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function sqToRC(sq) { return { r: 8 - parseInt(sq[1], 10), c: FILES.indexOf(sq[0]) }; }
  function rcToSq(r, c) { return FILES[c] + (8 - r); }

  function mkMove(opts) {
    return {
      from: opts.from, to: opts.to, piece: opts.piece, color: opts.color,
      captured: opts.captured || null, promotion: opts.promotion || null,
      flags: opts.flags || "", special: opts.special || null,
    };
  }

  function Chess(fen) {
    this.load(fen || "start");
  }

  Chess.prototype.load = function (fen) {
    if (!fen || fen === "start") fen = START_FEN;
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split("/");
    const board = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          const n = parseInt(ch, 10);
          for (let k = 0; k < n; k++) row.push(null);
        } else {
          row.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? WHITE : BLACK });
        }
      }
      board.push(row);
    }
    this._board = board;
    this._turn = parts[1] === "b" ? BLACK : WHITE;
    const castling = parts[2] || "-";
    this._castling = {
      wK: castling.includes("K"), wQ: castling.includes("Q"),
      bK: castling.includes("k"), bQ: castling.includes("q"),
    };
    this._epSquare = parts[3] && parts[3] !== "-" ? parts[3] : null;
    this._halfmove = parseInt(parts[4], 10) || 0;
    this._fullmove = parseInt(parts[5], 10) || 1;
    return true;
  };

  Chess.prototype.board = function () {
    return this._board.map(row => row.map(cell => cell ? { type: cell.type, color: cell.color } : null));
  };

  Chess.prototype.get = function (sq) {
    const { r, c } = sqToRC(sq);
    if (!inBounds(r, c)) return null;
    const cell = this._board[r][c];
    return cell ? { type: cell.type, color: cell.color } : null;
  };

  Chess.prototype.turn = function () { return this._turn; };

  Chess.prototype.fen = function () {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = "", empty = 0;
      for (let c = 0; c < 8; c++) {
        const cell = this._board[r][c];
        if (!cell) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += cell.color === WHITE ? cell.type.toUpperCase() : cell.type;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    let castling = "";
    if (this._castling.wK) castling += "K";
    if (this._castling.wQ) castling += "Q";
    if (this._castling.bK) castling += "k";
    if (this._castling.bQ) castling += "q";
    if (!castling) castling = "-";
    return `${rows.join("/")} ${this._turn} ${castling} ${this._epSquare || "-"} ${this._halfmove} ${this._fullmove}`;
  };

  Chess.prototype._clone = function () {
    const c = Object.create(Chess.prototype);
    c._board = this._board.map(row => row.map(cell => cell ? { type: cell.type, color: cell.color } : null));
    c._turn = this._turn;
    c._castling = Object.assign({}, this._castling);
    c._epSquare = this._epSquare;
    c._halfmove = this._halfmove;
    c._fullmove = this._fullmove;
    return c;
  };

  Chess.prototype._kingPos = function (color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = this._board[r][c];
      if (p && p.type === "k" && p.color === color) return { r, c };
    }
    return null;
  };

  Chess.prototype._squareAttacked = function (r, c, byColor) {
    const board = this._board;
    const pawnDir = byColor === WHITE ? 1 : -1;
    for (const dc of [-1, 1]) {
      const rr = r + pawnDir, cc = c + dc;
      if (inBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p && p.type === "p" && p.color === byColor) return true;
      }
    }
    for (const [dr, dc] of KNIGHT_OFFS) {
      const rr = r + dr, cc = c + dc;
      if (inBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p && p.type === "n" && p.color === byColor) return true;
      }
    }
    for (const [dr, dc] of KING_OFFS) {
      const rr = r + dr, cc = c + dc;
      if (inBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p && p.type === "k" && p.color === byColor) return true;
      }
    }
    for (const [dr, dc] of BISHOP_DIRS) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p) { if (p.color === byColor && (p.type === "b" || p.type === "q")) return true; break; }
        rr += dr; cc += dc;
      }
    }
    for (const [dr, dc] of ROOK_DIRS) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p) { if (p.color === byColor && (p.type === "r" || p.type === "q")) return true; break; }
        rr += dr; cc += dc;
      }
    }
    return false;
  };

  Chess.prototype.in_check = function () {
    const kp = this._kingPos(this._turn);
    return kp ? this._squareAttacked(kp.r, kp.c, opponent(this._turn)) : false;
  };

  Chess.prototype._pseudoMoves = function (color) {
    const moves = [], board = this._board;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      const from = rcToSq(r, c);

      if (piece.type === "p") {
        const dir = color === WHITE ? -1 : 1;
        const startRow = color === WHITE ? 6 : 1;
        const promoRow = color === WHITE ? 0 : 7;
        const r1 = r + dir;
        if (inBounds(r1, c) && !board[r1][c]) {
          if (r1 === promoRow) {
            ["q","r","b","n"].forEach(pr => moves.push(mkMove({ from, to: rcToSq(r1,c), piece: "p", color, promotion: pr, flags: "p" })));
          } else {
            moves.push(mkMove({ from, to: rcToSq(r1,c), piece: "p", color }));
            const r2 = r + dir * 2;
            if (r === startRow && inBounds(r2, c) && !board[r2][c]) {
              moves.push(mkMove({ from, to: rcToSq(r2,c), piece: "p", color, special: "big", flags: "b" }));
            }
          }
        }
        for (const dc of [-1, 1]) {
          const rr = r + dir, cc = c + dc;
          if (!inBounds(rr, cc)) continue;
          const target = board[rr][cc];
          if (target && target.color !== color) {
            if (rr === promoRow) {
              ["q","r","b","n"].forEach(pr => moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: "p", color, captured: target.type, promotion: pr, flags: "cp" })));
            } else {
              moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: "p", color, captured: target.type, flags: "c" }));
            }
          } else if (!target && this._epSquare === rcToSq(rr, cc)) {
            moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: "p", color, captured: "p", special: "ep", flags: "c" }));
          }
        }
      } else if (piece.type === "n" || piece.type === "k") {
        const offs = piece.type === "n" ? KNIGHT_OFFS : KING_OFFS;
        offs.forEach(([dr, dc]) => {
          const rr = r + dr, cc = c + dc;
          if (!inBounds(rr, cc)) return;
          const target = board[rr][cc];
          if (!target) moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: piece.type, color }));
          else if (target.color !== color) moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: piece.type, color, captured: target.type, flags: "c" }));
        });
        if (piece.type === "k") {
          const rank = color === WHITE ? 7 : 0;
          if (r === rank && c === 4) {
            const rights = this._castling;
            const kSide = color === WHITE ? rights.wK : rights.bK;
            const qSide = color === WHITE ? rights.wQ : rights.bQ;
            const oppo = opponent(color);
            if (kSide && !board[rank][5] && !board[rank][6] && board[rank][7] && board[rank][7].type === "r" && board[rank][7].color === color) {
              if (!this._squareAttacked(rank,4,oppo) && !this._squareAttacked(rank,5,oppo) && !this._squareAttacked(rank,6,oppo)) {
                moves.push(mkMove({ from, to: rcToSq(rank,6), piece: "k", color, special: "castleK", flags: "k" }));
              }
            }
            if (qSide && !board[rank][3] && !board[rank][2] && !board[rank][1] && board[rank][0] && board[rank][0].type === "r" && board[rank][0].color === color) {
              if (!this._squareAttacked(rank,4,oppo) && !this._squareAttacked(rank,3,oppo) && !this._squareAttacked(rank,2,oppo)) {
                moves.push(mkMove({ from, to: rcToSq(rank,2), piece: "k", color, special: "castleQ", flags: "q" }));
              }
            }
          }
        }
      } else {
        const dirs = piece.type === "b" ? BISHOP_DIRS : piece.type === "r" ? ROOK_DIRS : QUEEN_DIRS;
        dirs.forEach(([dr, dc]) => {
          let rr = r + dr, cc = c + dc;
          while (inBounds(rr, cc)) {
            const target = board[rr][cc];
            if (!target) {
              moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: piece.type, color }));
            } else {
              if (target.color !== color) moves.push(mkMove({ from, to: rcToSq(rr,cc), piece: piece.type, color, captured: target.type, flags: "c" }));
              break;
            }
            rr += dr; cc += dc;
          }
        });
      }
    }
    return moves;
  };

  Chess.prototype._applyMove = function (move) {
    const board = this._board;
    const { r: fr, c: fc } = sqToRC(move.from);
    const { r: tr, c: tc } = sqToRC(move.to);
    const piece = board[fr][fc];
    const color = piece.color;
    let newEp = null;

    if (move.special === "ep") board[fr][tc] = null;

    board[tr][tc] = { type: move.promotion || piece.type, color };
    board[fr][fc] = null;

    if (move.special === "big") newEp = rcToSq((fr + tr) / 2, fc);
    if (move.special === "castleK") { board[tr][5] = board[tr][7]; board[tr][7] = null; }
    else if (move.special === "castleQ") { board[tr][3] = board[tr][0]; board[tr][0] = null; }

    if (piece.type === "k") {
      if (color === WHITE) { this._castling.wK = false; this._castling.wQ = false; }
      else { this._castling.bK = false; this._castling.bQ = false; }
    }
    if (move.from === "a1" || move.to === "a1") this._castling.wQ = false;
    if (move.from === "h1" || move.to === "h1") this._castling.wK = false;
    if (move.from === "a8" || move.to === "a8") this._castling.bQ = false;
    if (move.from === "h8" || move.to === "h8") this._castling.bK = false;

    this._halfmove = (piece.type === "p" || move.captured) ? 0 : this._halfmove + 1;
    this._epSquare = newEp;
    if (color === BLACK) this._fullmove++;
    this._turn = opponent(color);
  };

  Chess.prototype._legalMoves = function (color) {
    const pseudo = this._pseudoMoves(color);
    const legal = [];
    for (const mv of pseudo) {
      const clone = this._clone();
      clone._applyMove(mv);
      const kp = clone._kingPos(color);
      if (kp && clone._squareAttacked(kp.r, kp.c, opponent(color))) continue;
      legal.push(mv);
    }
    return legal;
  };

  Chess.prototype._toSAN = function (move, legalMoves) {
    if (move.special === "castleK") return "O-O";
    if (move.special === "castleQ") return "O-O-O";
    const pieceLetter = move.piece === "p" ? "" : move.piece.toUpperCase();
    let disamb = "";
    if (move.piece !== "p" && move.piece !== "k") {
      const clash = legalMoves.filter(m => m.piece === move.piece && m.to === move.to && m.from !== move.from);
      if (clash.length) {
        const sameFile = clash.some(m => m.from[0] === move.from[0]);
        const sameRank = clash.some(m => m.from[1] === move.from[1]);
        disamb = !sameFile ? move.from[0] : !sameRank ? move.from[1] : move.from;
      }
    }
    const fromFile = (move.piece === "p" && move.captured) ? move.from[0] : "";
    const capture = move.captured ? "x" : "";
    const promo = move.promotion ? "=" + move.promotion.toUpperCase() : "";
    return pieceLetter + disamb + fromFile + capture + move.to + promo;
  };

  Chess.prototype._checkSuffix = function (move) {
    const clone = this._clone();
    clone._applyMove(move);
    const oppColor = opponent(move.color);
    const kp = clone._kingPos(oppColor);
    if (!kp || !clone._squareAttacked(kp.r, kp.c, move.color)) return "";
    return clone._legalMoves(oppColor).length === 0 ? "#" : "+";
  };

  Chess.prototype.moves = function (options) {
    options = options || {};
    const legal = this._legalMoves(this._turn);
    let filtered = options.square ? legal.filter(m => m.from === options.square) : legal;
    if (options.verbose) {
      return filtered.map(m => ({
        from: m.from, to: m.to, piece: m.piece, color: m.color,
        captured: m.captured || undefined, promotion: m.promotion || undefined,
        flags: m.flags, san: this._toSAN(m, legal) + this._checkSuffix(m),
      }));
    }
    return filtered.map(m => this._toSAN(m, legal) + this._checkSuffix(m));
  };

  Chess.prototype.move = function (moveInput) {
    if (typeof moveInput === "string") return null; // non utilisé par l'application
    const { from, to, promotion } = moveInput;
    const legal = this._legalMoves(this._turn);
    const candidates = legal.filter(m => m.from === from && m.to === to);
    if (!candidates.length) return null;
    const chosen = candidates.length > 1
      ? (candidates.find(m => m.promotion === (promotion || "q")) || candidates[0])
      : candidates[0];
    const san = this._toSAN(chosen, legal) + this._checkSuffix(chosen);
    const colorMoved = chosen.color;
    this._applyMove(chosen);
    return {
      from: chosen.from, to: chosen.to, piece: chosen.piece, color: colorMoved,
      captured: chosen.captured || undefined, promotion: chosen.promotion || undefined,
      flags: chosen.flags, san,
    };
  };

  Chess.prototype.in_checkmate = function () {
    return this.in_check() && this._legalMoves(this._turn).length === 0;
  };
  Chess.prototype.in_stalemate = function () {
    return !this.in_check() && this._legalMoves(this._turn).length === 0;
  };
  Chess.prototype.insufficient_material = function () {
    const pieces = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = this._board[r][c];
      if (p && p.type !== "k") pieces.push({ p, r, c });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].p.type === "b" || pieces[0].p.type === "n")) return true;
    if (pieces.length === 2 && pieces.every(x => x.p.type === "b")) {
      const colors = pieces.map(x => (x.r + x.c) % 2);
      if (colors[0] === colors[1]) return true;
    }
    return false;
  };
  Chess.prototype.in_draw = function () {
    return this.in_stalemate() || this.insufficient_material() || this._halfmove >= 100;
  };
  Chess.prototype.game_over = function () {
    return this.in_checkmate() || this.in_draw();
  };

  if (typeof window !== "undefined") window.Chess = Chess;
  if (typeof module !== "undefined" && module.exports) module.exports = { Chess };
})();
