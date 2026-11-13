// The buttons at the top right (and the language switch on the start screen).
import { setLang, nextLang, setText, onLangChange, t } from '../i18n.js';
import { $ } from '../util.js';

export function installHud(app) {
  const { sound, autopilot } = app;
  const tap = (id, fn) => $(id).addEventListener('click', e => { fn(e.currentTarget); e.currentTarget.blur(); });

  const autoBtn = $('btn-auto');
  autopilot.onChange = on => {
    autoBtn.setAttribute('aria-pressed', String(on));
    setText(autoBtn, on ? 'hud.autoOn' : 'hud.auto');
  };
  tap('btn-auto', () => { if (app.started) autopilot.toggle(); });

  tap('btn-sound', b => {
    const on = !sound.enabled;
    sound.setEnabled(on);
    setText(b, on ? 'hud.soundOn' : 'hud.soundOff');
    b.setAttribute('aria-pressed', String(on));
  });

  tap('btn-help', () => { $('help').hidden = !$('help').hidden; });

  tap('btn-full', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  tap('btn-lang', () => setLang(nextLang()));
  const syncTitle = () => { document.title = t('page.title'); };
  onLangChange(syncTitle);
  syncTitle();
}
