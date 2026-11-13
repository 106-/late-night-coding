// Terminal commands.  Output text comes from the language tables; commands themselves stay English.
import { t, getLang, setLang, LANGS } from '../i18n.js';
import { pick } from '../util.js';
import { CRT_COLORS } from '../actions.js';

const WORK = [
  'git status', 'make night', 'fix: off-by-one', 'ssh rei@tomorrow', 'while (awake) type();', 'penguin --feed --all',
  'SELECT * FROM sleep;', 'npm run dream', 'grep -r "bug" ./me', 'echo "almost done"', 'chmod +x coffee.sh', 'return to_bed;',
  'tail -f night.log', 'kill -9 worries', 'git commit -m "zzz"',
];
const PENGUIN = ['   .-^-.', '  ( o o )', '  /| v |\\', ' ( |   | )', '  `-m-m-`'];
const FILE_NAMES = ['todo.txt', 'night_shift.log', 'penguin.txt', '.secret'];
const ALIASES = {
  '?': 'help', hi: 'hello', こんにちは: 'hello', こんばんは: 'hello', lights: 'light', bgm: 'music', coffee: 'drink',
  morning: 'dawn', sunrise: 'dawn', zzz: 'sleep', dir: 'ls', cls: 'clear', vim: 'rm', code: 'auto', autopilot: 'auto',
  おまかせ: 'auto', tune: 'tweak', language: 'lang',
};

export function installShell(app) {
  const { term, rei, sound, actions } = app;
  const out = (text, level) => term.print(text, level);
  const lines = (list, level) => list.forEach(l => out(l, level));
  const onOff = (arg, current) => (arg === 'on' ? true : arg === 'off' ? false : !current);
  const fileLines = name => (name === 'penguin.txt' ? PENGUIN : t('shell.files')[name]);

  const commands = {
    help() { lines(t('shell.help')); },
    lamp([arg]) {
      const on = onOff(arg, actions.lampOn);
      actions.setLamp(on);
      out(`lamp: ${on ? 'on' : 'off'}`);
    },
    light([arg]) {
      const on = onOff(arg, actions.ceilingOn);
      out(`ceiling light: ${on ? 'on' : 'off'}`);
      actions.setCeiling(on);
    },
    crt([name]) {
      if (!actions.setCrtColor(name)) { out(`usage: crt ${Object.keys(CRT_COLORS).join('|')}`, 'dim'); return; }
      out(`phosphor: ${name}`);
    },
    dawn() { out('time: 05:40  (sunrise)'); actions.setDawn(true); },
    night() { out('time: 02:47  (night)'); actions.setDawn(false); },
    work() {
      if (rei.asleep) rei.wake();
      const tasks = [...WORK].sort(() => Math.random() - 0.5).slice(0, 5);
      out(t('shell.workStart'), 'bright');
      rei.emote(null);
      term.startWork(tasks, r => {
        if (r.aborted) { out(t('shell.workAborted'), 'dim'); rei.play('tilt', 1.6); return; }
        const wpm = Math.round(r.wpm);
        out(t('shell.workDone'), 'bright');
        out(` time ${r.sec.toFixed(1)}s   ${wpm} wpm   acc ${Math.round(r.acc * 100)}%`);
        sound.chime();
        if (wpm >= 35) rei.play('nod', 1.2);
        else rei.emote('relaxed', 0.7, 3);
      });
    },
    auto([speed]) {
      out(t('shell.autoStart'), 'dim');
      const s = parseFloat(speed);
      app.later(0.6, () => app.autopilot.start(s > 0 ? Math.min(4, s) : undefined));
    },
    music([arg]) {
      const on = sound.toggleMusic(arg ? arg === 'on' : undefined);
      out(`music: ${on ? 'on' : 'off'}`);
      if (on && !sound.enabled) out(t('shell.soundIsOff'), 'dim');
      if (on) rei.emote('relaxed', 0.8, 4);
    },
    hello() { rei.play('wave', 2.4); rei.lookAt('viewer', 3.5); out('hello, operator.'); },
    drink() { actions.tapCan(); out(t('shell.can')); },
    penguin() { actions.penguins(); rei.lookAt('penguin', 3); lines(PENGUIN); },
    sleep() { out(t('shell.sleep'), 'dim'); app.later(1.6, () => rei.sleep()); },
    ls() { out(FILE_NAMES.join('  ')); },
    cat([name]) {
      const f = FILE_NAMES.includes(name) && fileLines(name);
      if (!f) { out(t('shell.noFile', { name: name || '' }), 'dim'); rei.play('shake', 1.0); return; }
      lines(f);
      if (name === '.secret') { rei.emote('surprised', 0.8, 1.2); rei.lookAt('viewer', 3); }
    },
    neofetch() {
      const up = Math.floor(performance.now() / 60000);
      const info = ['rei@night', '---------', 'OS: REI-OS 2.6 night', 'Host: CRT-14 / 640K', `Uptime: ${up} min`, 'Shell: penguin-sh', 'Fuel: NIGHT SHIFT x3'];
      info.forEach((s, i) => out(`${(PENGUIN[i] ?? '').padEnd(13)}${s}`));
    },
    clear() { term.clear(); },
    date() { out(new Date().toLocaleString(getLang() === 'ja' ? 'ja-JP' : 'en-US')); },
    whoami() { out('rei'); rei.lookAt('viewer', 3); },
    rei() { rei.lookAt('viewer', 3.5); rei.play('tilt', 1.8); out(t('shell.rei')); },
    sudo() { sound.error(); out('rei is not in the sudoers file.', 'dim'); out('This incident will be reported to the penguins.', 'dim'); rei.play('shake', 1.1); },
    exit() { sound.error(); out(t('shell.exit'), 'dim'); rei.emote('sad', 0.7, 2.4); },
    rm() { sound.error(); out(t('shell.rm'), 'dim'); rei.emote('angry', 0.7, 2); rei.lookAt('viewer', 2.5); },
    lang([code]) {
      if (code && !LANGS.includes(code)) { out(t('shell.langUsage'), 'dim'); return; }
      setLang(code || LANGS.find(l => l !== getLang()));
      out(t('shell.lang'));
    },
    // the posture / layout tuning panel is hidden until asked for
    tweak([arg]) {
      const on = onOff(arg, app.tuner.enabled);
      app.tuner.enable(on);
      out(`tweak: ${on ? 'on' : 'off'}`);
    },
  };
  term.completions = Object.keys(commands);

  term.onCommand = line => {
    const [name, ...args] = line.split(/\s+/);
    const lower = name.toLowerCase();
    const key = ALIASES[lower] || lower;
    if (Object.hasOwn(commands, key)) { commands[key](args.map(a => a.toLowerCase())); return; }
    sound.error();
    out(`${name}: command not found`, 'dim');
    rei.play('tilt', 1.5);
  };

  // a slip in a typing shift: an error beep and a small head tilt
  term.onWorkKey = ok => { if (!ok) { sound.error(); rei.rollGoal = (Math.random() - 0.5) * 6; } };

  // greet the viewer; with auto, Rei starts writing code by herself unless they type first
  app.boot = ({ auto }) => {
    term.mode = 'boot';
    t('shell.boot').forEach((l, i) => out(l, i < 2 ? 'dim' : 'normal'));
    out(t(auto ? 'shell.bootAuto' : 'shell.bootManual'), 'bright');
    app.later(1.0, () => { rei.lookAt('viewer', 4); rei.emote('relaxed', 0.5, 3); });
    app.later(1.2, () => { if (term.mode === 'boot') term.mode = 'shell'; term.dirty = true; });
    if (auto) app.later(4.5, () => { if (!app.autopilot.running && term.mode === 'shell' && !app.typedSinceBoot) app.autopilot.start(); });
  };

  // something now and then when nothing has happened for a while
  let nextIdle = 38;
  app.onIdle = idle => {
    if (rei.asleep || term.mode !== 'shell') { nextIdle = idle + 30; return; }
    if (idle < 1) nextIdle = 30 + Math.random() * 25;
    if (idle < nextIdle) return;
    nextIdle = idle + 35 + Math.random() * 40;
    if (Math.random() < 0.28) { rei.play('yawn', 3.2); return; }
    if (Math.random() < 0.35 && actions.drink()) return;
    const look = pick([null, 'window', 'can', 'penguin', 'viewer', 'screen', null]);
    if (look) rei.lookAt(look, 3.5);
  };
}
