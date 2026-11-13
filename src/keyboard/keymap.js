// Maps KeyboardEvent.code to the real keycap positions of the keyboard modelled in the scene.
import * as THREE from 'three';

const NAME_TO_CODE = {
  '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
  ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '': 'Space',
  Back: 'Backspace', Tab: 'Tab', Caps: 'CapsLock', Enter: 'Enter', Shift: 'ShiftLeft', Ctrl: 'ControlLeft',
  Win: 'MetaLeft', Alt: 'AltLeft', Menu: 'ContextMenu', Esc: 'Escape', PrtSc: 'PrintScreen', Scroll: 'ScrollLock',
  Pause: 'Pause', Ins: 'Insert', Home: 'Home', PgUp: 'PageUp', Del: 'Delete', End: 'End', PgDn: 'PageDown',
  Up: 'ArrowUp', Left: 'ArrowLeft', Down: 'ArrowDown', Right: 'ArrowRight', Num: 'NumLock',
  '*': 'NumpadMultiply', '+': 'NumpadAdd',
};
const DUP_TO_CODE = {
  Shift: 'ShiftRight', Ctrl: 'ControlRight', Win: 'MetaRight', Alt: 'AltRight', Enter: 'NumpadEnter',
  '/': 'NumpadDivide', '-': 'NumpadSubtract', '.': 'NumpadDecimal',
};
// keys that exist on JIS boards but not on the modelled one: borrow the nearest keycap
const ALIASES = {
  IntlYen: 'Backspace', IntlRo: 'ShiftRight', Convert: 'Space', NonConvert: 'Space', KanaMode: 'AltRight',
  Lang1: 'AltRight', Lang2: 'AltLeft', OSLeft: 'MetaLeft', OSRight: 'MetaRight',
};

// touch-typing finger assignment: [hand, finger] with finger 0 = thumb … 4 = little
const FINGERS = {};
const assign = (hand, finger, codes) => codes.split(' ').forEach(c => { FINGERS[c] = [hand, finger]; });
assign('L', 4, 'Escape Backquote Digit1 Tab KeyQ CapsLock KeyA ShiftLeft KeyZ ControlLeft MetaLeft F1');
assign('L', 3, 'Digit2 KeyW KeyS KeyX F2');
assign('L', 2, 'Digit3 KeyE KeyD KeyC F3 F4');
assign('L', 1, 'Digit4 Digit5 KeyR KeyT KeyF KeyG KeyV KeyB F5 F6');
assign('L', 0, 'AltLeft');
assign('R', 0, 'Space AltRight');
assign('R', 1, 'Digit6 Digit7 KeyY KeyU KeyH KeyJ KeyN KeyM F7 F8 ArrowLeft Numpad1 Numpad4 Numpad7 NumLock Insert Delete');
assign('R', 2, 'Digit8 KeyI KeyK Comma F9 ArrowUp ArrowDown Numpad2 Numpad5 Numpad8 NumpadDivide Home End Numpad0');
assign('R', 3, 'Digit9 KeyO KeyL Period F10 ArrowRight Numpad3 Numpad6 Numpad9 NumpadMultiply NumpadDecimal PageUp PageDown');
assign('R', 4, 'Digit0 Minus Equal KeyP BracketLeft BracketRight Backslash Semicolon Quote Enter ShiftRight Slash Backspace ' +
  'ControlRight MetaRight ContextMenu F11 F12 PrintScreen ScrollLock Pause NumpadSubtract NumpadAdd NumpadEnter');

export function buildKeyMap(meta) {
  const kb = meta.keyboard;
  const ax = new THREE.Vector3().fromArray(kb.x);   // along a row, towards the typist's right
  const ay = new THREE.Vector3().fromArray(kb.y);   // away from the typist
  const up = new THREE.Vector3().fromArray(kb.z);
  // AABB extents in Blender XY -> real keycap width/depth for a board rotated about the vertical
  const c = Math.abs(ax.x), s = Math.abs(ax.z);
  const det = c * c - s * s;
  const keys = new Map();
  for (const o of meta.keyboardObjects) {
    if (o.type !== 'MESH' || !o.name.startsWith('PROP_keyboard sculpted key')) continue;
    const raw = o.name.slice('PROP_keyboard sculpted key'.length).replace(/^ /, '');
    const m = /^(.*?)(\.\d{3})?$/.exec(raw);
    const name = m[1], dup = !!m[2];
    let code;
    if (dup) code = /^\d$/.test(name) ? `Numpad${name}` : DUP_TO_CODE[name];
    else if (/^[A-Z]$/.test(name)) code = `Key${name}`;
    else if (/^\d$/.test(name)) code = `Digit${name}`;
    else if (/^F\d+$/.test(name)) code = name;
    else code = NAME_TO_CODE[name];
    if (!code) continue;
    const [bx, by] = o.size;
    let w = (c * bx - s * by) / det, d = (c * by - s * bx) / det;
    if (!(w > 0.005 && d > 0.005)) { w = 0.018; d = 0.018; }
    const pos = new THREE.Vector3(o.center[0], o.top, o.center[2]);
    keys.set(code, { code, pos, w, d, finger: FINGERS[code] || ['R', 1] });
  }
  for (const [alias, real] of Object.entries(ALIASES)) if (keys.has(real)) keys.set(alias, { ...keys.get(real), code: alias });
  return { keys, ax, ay, up, home: { L: keys.get('KeyF'), R: keys.get('KeyJ') } };
}
