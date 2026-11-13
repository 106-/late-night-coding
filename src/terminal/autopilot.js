// Autopilot: Rei types real code from GitHub on her own, key by key, with a human rhythm and the
// odd typo, and glances at the viewer when she closes a block.
import { fetchSnippet } from './codesource.js';
import { t } from '../i18n.js';
import { rand } from '../util.js';

const PLAIN = {
  '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon',
  "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '`': 'Backquote', ' ': 'Space',
};
const SHIFTED = {
  '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5', '^': 'Digit6', '&': 'Digit7', '*': 'Digit8',
  '(': 'Digit9', ')': 'Digit0', '_': 'Minus', '+': 'Equal', '{': 'BracketLeft', '}': 'BracketRight', '|': 'Backslash',
  ':': 'Semicolon', '"': 'Quote', '<': 'Comma', '>': 'Period', '?': 'Slash', '~': 'Backquote',
};
const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const CLOSER = /^([}\])]+[;,)]*|end[;,)]*|fi|done|esac)$/;
const LANGUAGE = {
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', py: 'Python',
  go: 'Go', rs: 'Rust', lua: 'Lua', rb: 'Ruby', java: 'Java', sh: 'shell', zig: 'Zig',
};

// the key for a character, and whether Shift is held; null for what is not on the keyboard
function keyFor(ch) {
  if (/[a-z]/.test(ch)) return { code: `Key${ch.toUpperCase()}`, shift: false };
  if (/[A-Z]/.test(ch)) return { code: `Key${ch}`, shift: true };
  if (/[0-9]/.test(ch)) return { code: `Digit${ch}`, shift: false };
  if (PLAIN[ch]) return { code: PLAIN[ch], shift: false };
  if (SHIFTED[ch]) return { code: SHIFTED[ch], shift: true };
  return null;   // CJK in a comment and the like: it just appears
}

// a letter next to this one on the keyboard (for typos)
function neighbour(ch) {
  const lower = ch.toLowerCase();
  for (let r = 0; r < LETTER_ROWS.length; r++) {
    const i = LETTER_ROWS[r].indexOf(lower);
    if (i < 0) continue;
    const options = [LETTER_ROWS[r][i - 1], LETTER_ROWS[r][i + 1], LETTER_ROWS[r - 1]?.[i], LETTER_ROWS[r + 1]?.[i]].filter(Boolean);
    const n = options[Math.floor(Math.random() * options.length)];
    return ch === lower ? n : n.toUpperCase();
  }
  return null;
}

const indentOf = line => line.match(/^ */)[0].length;

export class Autopilot {
  constructor(app) {
    this.app = app;
    this.running = false;
    this.speed = 1;
    this.typoRate = 1;
    this.st = null;           // the piece being typed
    this.prefetch = null;     // the next piece, already on its way
    this.loading = false;
    this.onChange = null;     // (running) => void
  }

  get term() { return this.app.term; }
  get rei() { return this.app.rei; }

  start(speed) {
    if (this.running) return;
    const { term, rei } = this;
    if (term.mode === 'work') term.endWork(true);
    this.running = true;
    if (speed > 0) this.speed = speed;
    if (rei.asleep) rei.wake();
    this.st = null;
    term.startCode('autopilot');
    term.codeStatus(t('auto.fetching'));
    document.body.classList.add('autopilot');
    this.onChange?.(true);
    this.load();
  }

  stop() {
    if (!this.running) return;
    const source = this.st?.snippet;
    this.running = false;
    this.st = null; this.prefetch = null; this.loading = false;
    this.term.endCode();
    this.term.print('autopilot: off', 'dim');
    if (source?.url) this.term.print(source.url, 'dim');
    this.rei.lookAt('viewer', 2);
    this.rei.emote('relaxed', 0.5, 2);
    document.body.classList.remove('autopilot');
    this.onChange?.(false);
  }

  toggle() { if (this.running) this.stop(); else this.start(); }

  // for debugging from the console
  get state() {
    const st = this.st;
    return st && { source: st.snippet.source, line: st.li, col: st.ci, lines: st.lines.length, loading: this.loading };
  }

  async load() {
    this.loading = true;
    if (this.st) this.term.codeStatus(t('auto.next'));
    const snippet = (this.prefetch && await this.prefetch) || await fetchSnippet();
    this.prefetch = null;
    if (!this.running) return;
    this.begin(snippet);
  }

  begin(snippet) {
    const lines = snippet.text.split('\n');
    const ext = (snippet.source.match(/\.(\w+)$/) || [])[1];
    this.st = { snippet, lines, li: 0, ci: 0, wait: 1.2, pending: [], done: false, language: LANGUAGE[ext] || '' };
    this.loading = false;
    this.term.startCode(snippet.source);
    this.indent(lines[0]);
    this.status();
    this.rei.lookAt('screen', 2);
    this.prefetch = fetchSnippet().catch(() => null);
  }

  status() {
    const st = this.st;
    this.term.codeStatus(t('auto.typing', { lang: st.language ? `${st.language} · ` : '', line: st.li + 1, total: st.lines.length }));
  }

  // the editor indents for her
  indent(line) { for (let k = 0; k < indentOf(line); k++) this.term.codeChar(' '); }

  press(code, shift) {
    const { actions, keymap } = this.app;
    if (shift) actions.pressKey(keymap.keys.get(code)?.finger[0] === 'L' ? 'ShiftRight' : 'ShiftLeft');
    actions.pressKey(code);
  }

  typeChar(ch) {
    const k = keyFor(ch);
    if (k) this.press(k.code, k.shift);
    this.term.codeChar(ch);
  }

  // per frame
  update(dt) {
    const st = this.st;
    if (!this.running || !st || this.loading) return;
    if (this.rei.handsBusy) return;          // drinking: the code waits for her
    st.wait -= dt;
    for (let guard = 0; this.st === st && !this.loading && st.wait <= 0 && guard < 8; guard++) {
      if (st.done) { this.load(); break; }
      this.step();
    }
  }

  // one key (or one pending correction)
  step() {
    const st = this.st;
    if (st.pending.length) { st.pending.shift()(); return; }
    const line = st.lines[st.li];
    const body = line.slice(indentOf(line));
    if (st.ci >= body.length) { this.endOfLine(); return; }
    const ch = body[st.ci], prev = body[st.ci - 1];
    // an occasional slip on a letter, noticed and fixed
    if (/[a-z]/i.test(ch) && Math.random() < 0.012 * this.typoRate) {
      const wrong = neighbour(ch);
      if (wrong) {
        this.typeChar(wrong);
        st.wait = rand(0.18, 0.4);
        st.pending.push(() => { this.press('Backspace', false); this.term.codeBack(); st.wait = rand(0.12, 0.22); });
        return;
      }
    }
    this.typeChar(ch);
    st.ci++;
    // rhythm: runs of letters are quick, symbols and shifted keys slower, a pause now and then
    let d;
    if (/[a-z0-9]/i.test(ch) && prev && /[a-z0-9]/i.test(prev)) d = rand(0.07, 0.13);
    else if (ch === ' ') d = rand(0.09, 0.16);
    else d = rand(0.13, 0.22);
    if (keyFor(ch)?.shift) d += 0.05;
    if (ch === ' ' && Math.random() < 0.05) { d += rand(0.3, 0.8); this.rei.lookAt('screen', d + 0.6); }   // finding the next word
    st.wait = d / this.speed;
  }

  // a line is finished: Enter, auto-indent, maybe a look at the viewer
  endOfLine() {
    const st = this.st, { lines, li } = st, rei = this.rei, app = this.app;
    const line = lines[li], trimmed = line.trim(), n = indentOf(line);
    if (li >= lines.length - 1) { this.finish(); return; }
    const nextLine = lines.slice(li + 1).find(l => l.trim()) ?? '';
    const closing = CLOSER.test(trimmed);
    // a dedent to the top without a closing line (Python) ends a block too; with `end` / `}` next, wait for that line
    const dedentEnd = !closing && n > 0 && indentOf(nextLine) === 0 && !CLOSER.test(nextLine.trim());
    let look = 0;
    if (trimmed && closing && n === 0) look = rand(2.2, 3.0);                 // a whole function done
    else if (trimmed && ((closing && n <= 8) || dedentEnd)) look = rand(1.2, 1.9);
    else if (trimmed && closing && Math.random() < 0.2) look = rand(0.7, 1.0);

    this.press('Enter', false);
    this.term.codeChar('\n');
    st.li++; st.ci = 0;
    this.indent(lines[st.li]);
    let pause = rand(0.2, 0.55);
    if (look) {
      app.later(0.15, () => {
        if (this.st !== st) return;
        rei.lookAt('viewer', look);
        if (n === 0 && Math.random() < 0.25) rei.emote('relaxed', 0.55, look);
        if (n === 0 && Math.random() < 0.3) rei.play('nod', 1.1);
        else if (Math.random() < 0.15) rei.play('tilt', 1.4);
      });
      pause += look + 0.25;
      // a whole function done: now and then a sip before going on (typing waits while she drinks)
      if (n === 0 && Math.random() < 0.15) app.later(look + 0.1, () => app.actions.drink());
    }
    // about to start a new top-level definition: think a moment first
    const upcoming = lines[st.li];
    if (!look && upcoming.trim() && indentOf(upcoming) === 0 && Math.random() < 0.6) pause += rand(0.8, 1.8);
    st.wait = pause;
    if (!look) rei.lookAt('screen', pause + 0.6);     // a pause to think: eyes stay on the code
    this.status();
  }

  // the piece is done: a moment's satisfaction, maybe a sip, then the next one
  finish() {
    const st = this.st, app = this.app;
    st.done = true;
    this.term.codeStatus(t('auto.saved', { total: st.lines.length, source: st.snippet.source }));
    app.sound.tone({ freq: 660, to: 990, dur: 0.12, gain: 0.03 });
    app.later(0.4, () => { this.rei.lookAt('viewer', 3.2); this.rei.play('nod', 1.2); });
    if (Math.random() < 0.5) app.later(3.0, () => app.actions.drink());
    st.wait = 5.5;
  }
}
