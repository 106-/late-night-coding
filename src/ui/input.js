// The keyboard: every key you press, Rei presses on her keyboard, and it goes to the terminal.
import { $ } from '../util.js';

// while an IME is composing, the key value is hidden: fall back to the physical key
function plainKey(e) {
  if (e.key !== 'Process' && e.key !== 'Unidentified') return e;
  const m = /^Key([A-Z])$/.exec(e.code) || /^Digit(\d)$/.exec(e.code);
  if (m) return { key: e.shiftKey ? m[1] : m[1].toLowerCase() };
  const map = { Space: ' ', Minus: '-', Period: '.' };
  return map[e.code] ? { key: map[e.code] } : e;
}

export function installInput(app) {
  const { rei, term, actions, autopilot, cameraViews } = app;
  const help = $('help');

  window.addEventListener('keydown', e => {
    if (!app.started) {
      if (e.key === 'Enter' && !$('boot-start').hidden) $('boot-start').click();
      return;
    }
    if (e.target instanceof Element && e.target.closest('#tuner')) return;   // sliders keep their arrow keys
    if (e.key === 'Escape' && cameraViews.view === 'free') { cameraViews.set('scene'); e.preventDefault(); return; }
    // autopilot: her hands are busy; Esc hands the keyboard back
    if (autopilot.running) {
      if (e.key === 'Escape') { autopilot.stop(); e.preventDefault(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^F\d+$/.test(e.code)) { rei.press(e.code); return; }   // F keys: her finger only, the browser keeps them
    if (e.key === 'Escape' && !help.hidden) { help.hidden = true; e.preventDefault(); return; }
    if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur();
    e.preventDefault();
    app.idle = 0;
    app.typedSinceBoot = true;   // the viewer took the keyboard first: no autopilot at boot
    if (!e.repeat || e.key === 'Backspace') actions.pressKey(e.code);
    term.key(plainKey(e));
  });
}
