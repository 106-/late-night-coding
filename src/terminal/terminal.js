// The CRT terminal: a text buffer drawn to a canvas that feeds both the 3D tube and the HUD mirror.
// Modes: boot (output only), shell (prompt), work (typing shift), code (Rei's autopilot editor).
const COLS = 46, ROWS = 16;
const W = 800, H = 600, PAD_X = 34, PAD_Y = 30, LINE = 34, FONT = 27;
const FONT_STACK = '"Cascadia Mono", "BIZ UDGothic", Consolas, "MS Gothic", monospace';
const COLOR = { normal: '#c9c9c9', dim: '#6f6f6f', bright: '#ffffff', number: '#5a5a5a', rule: '#4a4a4a' };
const MAX_LINES = 200;

// CJK and other wide glyphs take two cells
const isWide = ch => ch.codePointAt(0) > 0x2e7f;
const widthOf = s => { let n = 0; for (const ch of s) n += isWide(ch) ? 2 : 1; return n; };

function wrap(text, cols = COLS) {
  const out = [];
  let row = '', n = 0;
  for (const ch of text) {
    const w = isWide(ch) ? 2 : 1;
    if (n + w > cols) { out.push(row); row = ''; n = 0; }
    row += ch; n += w;
  }
  out.push(row);
  return out;
}

export class Terminal {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.lines = [];            // { text, level }
    this.queue = [];            // pending output, revealed line by line
    this.queueT = 0;
    this.input = '';
    this.prompt = 'rei@night:~$ ';
    this.history = []; this.histIdx = 0;
    this.mode = 'boot';
    this.work = null;           // typing shift state
    this.code = null;           // autopilot editor state
    this.completions = [];      // words Tab completes
    this.onCommand = null;      // (line) => void
    this.onWorkKey = null;      // (ok) => void, each key in a typing shift
    this.dirty = true;
    this.blink = 0;
    this.version = 0;           // bumps whenever the canvas is redrawn
  }

  // --- output -----------------------------------------------------------------------------
  print(text = '', level = 'normal') {
    for (const raw of String(text).split('\n')) for (const row of wrap(raw)) this.queue.push({ text: row, level });
  }

  clear() { this.lines.length = 0; this.queue.length = 0; this.dirty = true; }

  flush() { while (this.queue.length) this.lines.push(this.queue.shift()); this.trim(); }

  trim() { if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES); }

  // --- input (returns true when the key changed something) ----------------------------------
  key(e) {
    if (this.mode === 'work') return this.workKey(e);
    if (this.mode !== 'shell') return false;
    const k = e.key;
    if (k === 'Enter') {
      const cmd = this.input.trim();
      this.flush();
      this.lines.push({ text: this.prompt + this.input, level: 'bright' });
      this.input = '';
      if (cmd) { this.history.push(cmd); this.histIdx = this.history.length; this.onCommand?.(cmd); }
    } else if (k === 'Backspace') {
      this.input = [...this.input].slice(0, -1).join('');
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (!this.history.length) return false;
      this.histIdx = Math.max(0, Math.min(this.history.length, this.histIdx + (k === 'ArrowUp' ? -1 : 1)));
      this.input = this.history[this.histIdx] ?? '';
    } else if (k === 'Escape') {
      this.input = '';
    } else if (k === 'Tab') {
      const hits = this.completions.filter(w => w.startsWith(this.input));
      if (!this.input || hits.length !== 1) return false;
      this.input = hits[0] + ' ';
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
      if (widthOf(this.prompt + this.input) < COLS - 1) this.input += k;
    } else return false;
    this.dirty = true;
    return true;
  }

  // --- typing shift: copy each line exactly ----------------------------------------------------
  startWork(tasks, onDone) {
    this.flush();
    this.mode = 'work';
    this.work = { tasks, i: 0, typed: '', miss: 0, hits: 0, start: 0, onDone, flash: 0 };
    this.dirty = true;
  }

  workKey(e) {
    const w = this.work;
    if (e.key === 'Escape') { this.endWork(true); return true; }
    if (e.key.length !== 1) return false;
    const target = w.tasks[w.i];
    if (!w.start) w.start = performance.now();
    if (e.key === target[w.typed.length]) {
      w.typed += e.key; w.hits++;
      this.onWorkKey?.(true);
      if (w.typed.length === target.length) {
        this.lines.push({ text: `[ok] ${target}`, level: 'dim' });
        w.i++; w.typed = '';
        if (w.i >= w.tasks.length) this.endWork(false);
      }
    } else { w.miss++; w.flash = 1; this.onWorkKey?.(false); }
    this.dirty = true;
    return true;
  }

  endWork(aborted) {
    const w = this.work;
    if (!w) return;
    this.mode = 'shell'; this.work = null;
    const sec = w.start ? (performance.now() - w.start) / 1000 : 0;
    const wpm = sec > 0 ? (w.hits / 5) / (sec / 60) : 0;
    const acc = w.hits + w.miss > 0 ? w.hits / (w.hits + w.miss) : 0;
    w.onDone?.({ aborted, sec, wpm, acc });
    this.dirty = true;
  }

  // --- autopilot editor: Rei types into it on her own ---------------------------------------------
  startCode(title) {
    this.flush();
    this.mode = 'code';
    this.code = { title, lines: [''], status: '' };
    this.dirty = true;
  }

  codeChar(ch) {
    const c = this.code;
    if (!c) return;
    if (ch === '\n') c.lines.push('');
    else c.lines[c.lines.length - 1] += ch;
    if (c.lines.length > 400) c.lines.splice(0, c.lines.length - 400);
    this.dirty = true;
  }

  codeBack() {
    const c = this.code;
    if (!c) return;
    const i = c.lines.length - 1;
    c.lines[i] = [...c.lines[i]].slice(0, -1).join('');
    this.dirty = true;
  }

  codeStatus(text) { if (this.code) { this.code.status = text; this.dirty = true; } }

  endCode() {
    if (this.mode !== 'code') return;
    this.mode = 'shell'; this.code = null; this.dirty = true;
  }

  // --- per frame -------------------------------------------------------------------------------
  update(dt) {
    if (this.queue.length) {
      this.queueT -= dt;
      while (this.queue.length && this.queueT <= 0) { this.lines.push(this.queue.shift()); this.queueT += 0.045; this.dirty = true; }
      this.trim();
    } else this.queueT = 0;
    if (this.work?.flash) { this.work.flash = Math.max(0, this.work.flash - dt * 5); this.dirty = true; }
    const b = Math.floor(performance.now() / 530) % 2;
    if (b !== this.blink) { this.blink = b; this.dirty = true; }
    if (!this.dirty) return false;
    this.draw();
    this.dirty = false;
    this.version++;
    return true;
  }

  draw() {
    const c = this.ctx;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.textBaseline = 'top';
    if (this.mode === 'code' && this.code) this.drawCode();
    else this.drawShell();
    c.shadowBlur = 0;
  }

  drawShell() {
    const c = this.ctx;
    c.font = `${FONT}px ${FONT_STACK}`;
    const cw = c.measureText('M').width;
    let bottom = [];
    if (this.mode === 'work') {
      const w = this.work;
      bottom = [{ text: '', level: 'dim' }, { text: `job ${w.i + 1}/${w.tasks.length}   miss ${w.miss}`, level: 'dim' }, { work: true }];
    } else if (this.mode === 'shell') bottom = [{ text: this.prompt + this.input, level: 'bright', cursor: true }];
    const rows = this.lines.concat(bottom).slice(-ROWS);

    c.shadowColor = 'rgba(255,255,255,0.55)';
    c.shadowBlur = 7;
    rows.forEach((row, r) => {
      const y = PAD_Y + r * LINE;
      if (row.work) {
        const w = this.work, target = w.tasks[w.i] || '';
        const at = col => PAD_X + col * cw;
        c.fillStyle = COLOR.dim; this.drawText('> ', at(0), y, cw);
        c.fillStyle = COLOR.bright; this.drawText(w.typed, at(2), y, cw);
        c.fillStyle = w.flash > 0.3 ? '#fff' : COLOR.dim; this.drawText(target.slice(w.typed.length), at(2 + w.typed.length), y, cw);
        if (this.blink || w.flash > 0) { c.fillStyle = '#fff'; c.fillRect(at(2 + w.typed.length), y + LINE - 8, cw, 4); }
        return;
      }
      c.fillStyle = COLOR[row.level] || COLOR.normal;
      this.drawText(row.text, PAD_X, y, cw);
      if (row.cursor && this.blink) c.fillRect(PAD_X + widthOf(row.text) * cw, y + 1, cw, FONT + 1);
    });
  }

  drawCode() {
    const c = this.ctx, code = this.code;
    const F = 21, L = 26, PX = 22, PY = 20, NUM = 4;
    c.font = `${F}px ${FONT_STACK}`;
    const cw = c.measureText('M').width;
    const cols = Math.floor((W - PX * 2) / cw);
    const textCols = cols - NUM - 1;
    const rows = Math.floor((H - PY * 2) / L) - 3;   // header, rule, status
    const put = (str, col, row, color) => { c.fillStyle = color; this.drawText(str, PX + col * cw, PY + row * L, cw); };
    c.shadowColor = 'rgba(255,255,255,0.5)';
    c.shadowBlur = 6;
    // header
    put(code.title.length > cols ? '…' + code.title.slice(-(cols - 1)) : code.title, 0, 0, COLOR.dim);
    c.fillStyle = COLOR.rule; c.fillRect(PX, PY + L + 6, W - PX * 2, 2);
    // body: soft-wrapped rows, newest at the bottom, comments dimmed
    const vis = [];
    let inBlock = false;
    code.lines.forEach((line, n) => {
      const t = line.trim();
      const startsBlock = /^\/\*/.test(t) || /^("""|''')/.test(t);
      const comment = inBlock || startsBlock || /^(\/\/|#(?!include|define|if|endif|else|pragma)|--|\/\*|\*)/.test(t);
      if (startsBlock && !/\*\/|("""|''').*("""|''')/.test(t.slice(2))) inBlock = true;
      else if (inBlock && /\*\/|"""|'''/.test(t)) inBlock = false;
      const chars = [...line];
      if (!chars.length) vis.push({ n, text: '', first: true, comment });
      for (let i = 0; i < chars.length; i += textCols) vis.push({ n, text: chars.slice(i, i + textCols).join(''), first: i === 0, comment });
    });
    const shown = vis.slice(-rows);
    shown.forEach((r, i) => {
      if (r.first) put(String(r.n + 1).padStart(NUM - 1), 0, i + 2, COLOR.number);
      put(r.text, NUM + 1, i + 2, r.comment ? COLOR.dim : COLOR.normal);
    });
    // cursor at the end of the last line
    const last = shown[shown.length - 1];
    if (last && this.blink) {
      const col = NUM + 1 + [...last.text].length;
      c.fillStyle = '#fff';
      c.fillRect(PX + Math.min(col, cols) * cw, PY + (shown.length + 1) * L + 2, cw * 0.9, F);
    }
    put(code.status || '', 0, rows + 2, COLOR.dim);
  }

  // text on a fixed cell grid starting at pixel x0, so wide glyphs take exactly two cells
  drawText(str, x0, y, cw) {
    const c = this.ctx;
    let x = x0, run = '', runX = x;
    for (const ch of str) {
      if (isWide(ch)) {
        if (run) { c.fillText(run, runX, y); run = ''; }
        c.fillText(ch, x + (cw * 2 - c.measureText(ch).width) / 2, y);
        x += cw * 2; runX = x;
      } else { run += ch; x += cw; }
    }
    if (run) c.fillText(run, runX, y);
  }
}

// Copies the terminal into a visible canvas, tinted with the phosphor colour, with scanlines.
export function drawMirror(canvas, term, color) {
  const c = canvas.getContext('2d');
  c.globalCompositeOperation = 'source-over';
  c.drawImage(term.canvas, 0, 0, canvas.width, canvas.height);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = color;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < canvas.height; y += 3) c.fillRect(0, y, canvas.width, 1);
}
