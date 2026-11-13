// Tuning panel: sliders for Rei's posture (saved to assets/pose.json), the desk layout (saved to
// assets/layout.json; the room is re-baked from it in Blender), and the camera views.
// Hidden until the `tweak` command (or ?tweak in the URL) turns it on.
import * as THREE from 'three';
import { POSE_DEFAULTS } from '../rei/pose.js';
import { t, setText, translatePage } from '../i18n.js';
import { $ } from '../util.js';

// [key, min, max, step, unit]; 'cm' values are stored in metres and shown in centimetres.
// Row labels are tuner.rows.<key>, group titles tuner.groups.<id>.
const POSE_GROUPS = [
  { id: 'seat', rows: [['back', -6, 20, 0.1, 'cm'], ['side', -10, 10, 0.1, 'cm'], ['hipHeight', 5, 22, 0.1, 'cm'], ['yawOffset', -30, 30, 1, '°']] },
  { id: 'torso', rows: [['pelvisBack', -10, 45, 1, '°'], ['spine', -15, 30, 1, '°'], ['chest', -15, 30, 1, '°'],
    ['shoulderBack', -15, 15, 1, '°'], ['shoulderDrop', -10, 15, 1, '°'], ['headRoll', -20, 20, 1, '°']] },
  { id: 'neck', extra: 'gaze', rows: [['headLeft', -60, 90, 1, '°'], ['headRight', -60, 90, 1, '°'], ['headUp', -40, 60, 1, '°'],
    ['headDown', -40, 60, 1, '°'], ['headFollowH', 0, 1, 0.01, ''], ['headFollowV', 0, 1, 0.01, '']] },
  { id: 'arms', rows: [['elbowOut', -0.5, 1.5, 0.05, ''], ['elbowBack', -0.5, 1.5, 0.05, ''], ['hover', 0, 3, 0.1, 'cm'], ['handTravel', 0, 1, 0.01, '']] },
  { id: 'hands', rows: [['handYaw', -10, 40, 1, '°'], ['handPitch', -25, 25, 1, '°'], ['handRoll', -20, 30, 1, '°']] },
  { id: 'fingers', rows: [['fingerBase', 0, 50, 0.5, '°'], ['fingerMid', 0, 60, 0.5, '°'], ['fingerTip', 0, 40, 0.5, '°'], ['thumb', 0, 2, 0.05, '×']] },
  { id: 'face', rows: [['lids', 0, 1, 0.01, ''], ['relaxed', 0, 1, 0.01, '']] },
  { id: 'yawn', extra: 'yawn', rows: [['yawnHandFwd', -3, 10, 0.1, 'cm'], ['yawnHandBack', -3, 12, 0.1, 'cm'], ['yawnHandUp', -6, 6, 0.1, 'cm']] },
  { id: 'can', extra: 'drink', rows: [['canFwd', 10, 60, 0.5, 'cm'], ['canLeft', -40, 60, 0.5, 'cm']] },
  { id: 'lights', extra: 'markers', rows: [['winAz', -180, 180, 1, '°'], ['winEl', -30, 85, 1, '°'], ['winPower', 0, 3, 0.05, '×'],
    ['fillAz', -180, 180, 1, '°'], ['fillEl', -30, 85, 1, '°'], ['fillPower', 0, 3, 0.05, '×'],
    ['crtFwd', -40, 120, 0.5, 'cm'], ['crtLeft', -120, 60, 0.5, 'cm'], ['crtUp', -60, 80, 0.5, 'cm'], ['crtPower', 0, 3, 0.05, '×'],
    ['lampPower', 0, 3, 0.05, '×'], ['ambientPower', 0, 3, 0.05, '×']] },
  { id: 'bloom', rows: [['bloomThreshold', 0, 1.5, 0.01, ''], ['bloomSoft', 0, 0.5, 0.01, ''], ['bloomStrength', 0, 1.5, 0.01, ''], ['bloomRadius', 0, 1, 0.01, '']] },
  { id: 'legs', rows: [['thigh', 60, 100, 1, '°'], ['knee', 60, 120, 1, '°'], ['spread', -5, 25, 1, '°']] },
];
// desk layout: changes need a room re-render to show in the background picture
const LAYOUT_ROWS = [
  ['kbSide', -30, 30, 0.5, 'cm'], ['kbAway', -10, 25, 0.5, 'cm'], ['kbYaw', -30, 30, 1, '°'], ['kbScale', 0.8, 1.6, 0.01, '×'],
  ['mouseShift', -20, 40, 0.5, 'cm'], ['chairFwd', -30, 30, 0.5, 'cm'], ['chairSide', -40, 40, 0.5, 'cm'], ['chairYaw', -45, 45, 1, '°'],
];
const GAZE_TARGETS = ['viewer', 'screen', 'window', 'keys', 'penguin', 'can', 'lamp'];
const POSE_KEYS = POSE_GROUPS.flatMap(g => g.rows.map(r => r[0]));

const fmt = (v, step) => v.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0);
const same = (a, b) => Math.abs(a - b) < 1e-6;

const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
// an element whose text follows the language
const tr = (tag, key, props) => { const e = el(tag, props); setText(e, key); return e; };
const button = (key, onClick, props) => {
  const b = tr('button', key, { type: 'button', ...props });
  b.addEventListener('click', () => { onClick(); b.blur(); });
  return b;
};

// POST to serve.mjs.  On a static host (GitHub Pages) there is no API.
class NoServer extends Error {}
async function api(url, body) {
  let res = null;
  try { res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch { /* offline */ }
  const j = res && /json/.test(res.headers.get('content-type') || '') ? await res.json().catch(() => null) : null;
  if (!j) throw new NoServer(t('tuner.noServer'));
  if (!j.ok) throw new Error(t('badRequest', { detail: j.detail ?? '' }));
  return j;
}

export class Tuner {
  constructor(app) {
    this.app = app;
    this.panel = $('tuner');
    this.body = this.panel.querySelector('.tn-body');
    this.status = this.panel.querySelector('.tn-status');
    this.readout = this.panel.querySelector('.tn-readout');
    this.enabled = false;
    this.saved = this.pick(app.rei.cfg);
    this.inputs = {};          // pose sliders
    this.layoutInputs = {};    // layout sliders
    this.readoutT = 0;

    this.buildLayout();
    for (const group of POSE_GROUPS) this.body.append(this.buildGroup(group));
    translatePage(this.panel);
    this.wire();
    this.sync();
    this.syncLayout();
  }

  pick(cfg) { return Object.fromEntries(POSE_KEYS.map(k => [k, cfg[k]])); }

  // --- building ---------------------------------------------------------------------------------

  slider([key, min, max, step, unit], { value, reference, onInput, reset }) {
    const scale = unit === 'cm' ? 100 : 1;
    const input = el('input', { type: 'range', min, max, step });
    const output = el('output');
    const row = el('label', { className: 'tn-row' }, tr('span', `tuner.rows.${key}`, { className: 'tn-label' }), input, output);
    const show = () => {
      output.textContent = `${fmt(Number(input.value), step)}${unit}`;
      output.classList.toggle('changed', !same(Number(input.value) / scale, reference()));
    };
    const set = v => { input.value = v * scale; show(); };
    input.addEventListener('input', () => { onInput(Number(input.value) / scale); show(); });
    input.addEventListener('pointerup', () => input.blur());          // give the keyboard back to Rei
    input.addEventListener('dblclick', () => { input.value = reset() * scale; input.dispatchEvent(new Event('input')); });
    set(value());
    return { row, set, show };
  }

  buildGroup(group) {
    const { rei } = this.app;
    const set = el('fieldset', {}, tr('legend', `tuner.groups.${group.id}`));
    for (const r of group.rows) {
      const key = r[0];
      const s = this.slider(r, {
        value: () => rei.cfg[key],
        reference: () => this.saved[key],
        onInput: v => { rei.setPose({ [key]: v }); this.markDirty(); },
        reset: () => POSE_DEFAULTS[key],
      });
      this.inputs[key] = s;
      set.append(s.row);
    }
    if (group.extra) set.append(this.buildExtra(group.extra));
    return set;
  }

  // buttons that try out what a group adjusts
  buildExtra(kind) {
    const { rei, actions } = this.app;
    const box = el('div', { className: 'tn-gaze' });
    if (kind === 'gaze') {
      box.append(tr('span', 'tuner.gaze', { className: 'tn-label' }));
      for (const target of GAZE_TARGETS) box.append(button(`tuner.gazeAt.${target}`, () => rei.lookAt(target, 6)));
    } else if (kind === 'yawn') {
      const hold = button('tuner.yawnHold', () => rei.play('yawn', 10));
      hold.dataset.i18nTitle = 'tuner.yawnHoldTitle';
      box.append(button('tuner.yawn', () => rei.play('yawn', 3.2)), hold);
    } else if (kind === 'drink') {
      box.append(button('tuner.drink', () => actions.drink()));
    } else if (kind === 'markers') {
      const cb = el('input', { type: 'checkbox', checked: true });
      this.app.showLightMarkers = true;
      cb.addEventListener('change', () => { this.app.showLightMarkers = cb.checked; cb.blur(); });
      return el('label', { className: 'tn-check' }, cb, tr('span', 'tuner.lightMarkers'));
    }
    return box;
  }

  buildLayout() {
    const { layout } = this.app;
    const set = el('fieldset', { className: 'tn-layout' }, tr('legend', 'tuner.groups.layout'));
    for (const r of LAYOUT_ROWS) {
      const key = r[0];
      const s = this.slider(r, {
        value: () => layout.current[key],
        reference: () => layout.baked[key],
        onInput: v => this.setLayout({ [key]: v }),
        reset: () => layout.baked[key],
      });
      this.layoutInputs[key] = s;
      set.append(s.row);
    }
    this.layoutNote = el('p', { className: 'tn-laynote' });
    const save = button('layout.save', () => this.saveLayout(), { className: 'primary' });
    save.dataset.i18nTitle = 'layout.saveTitle';
    const reset = button('layout.reset', () => this.setLayout({ ...layout.baked }));
    reset.dataset.i18nTitle = 'layout.resetTitle';
    this.layoutStatus = el('p', { className: 'tn-laystatus' });
    this.layoutStatus.setAttribute('aria-live', 'polite');
    set.append(el('div', { className: 'tn-layfoot' }, this.layoutNote, el('div', { className: 'tn-laybuttons' }, save, reset), this.layoutStatus));
    this.body.prepend(set);
  }

  wire() {
    const { rei } = this.app;
    const act = (name, fn) => this.panel.querySelector(`[data-act=${name}]`).addEventListener('click', fn);
    act('save', () => this.save());
    act('revert', () => { rei.setPose(this.saved); this.sync(); });
    act('defaults', () => { rei.setPose(this.pick(POSE_DEFAULTS)); this.sync(); });
    act('copy', async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(this.pick(rei.cfg), null, 2)); setText(this.status, 'tuner.status.copied'); }
      catch { setText(this.status, 'tuner.status.copyFailed'); }
    });
    act('close', () => this.open(false));
    const views = [...this.panel.querySelectorAll('[data-view]')];
    views.forEach(b => b.addEventListener('click', () => { this.app.cameraViews.set(b.dataset.view); b.blur(); }));
    this.app.cameraViews.onChange = view => {
      views.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    };
    $('btn-tune').addEventListener('click', e => { this.open(); e.currentTarget.blur(); });
  }

  // --- showing --------------------------------------------------------------------------------

  // the `tweak` command: show (and open) or hide the panel and the Tune / Camera buttons
  enable(on) {
    this.enabled = on;
    $('btn-tune').hidden = !on;
    $('btn-cam').hidden = !on;
    this.open(on);
    if (!on && this.app.cameraViews.view !== 'scene') this.app.cameraViews.set('scene');   // back to the normal view
  }

  open(on = this.panel.hidden) {
    this.panel.hidden = !on;
    $('btn-tune').setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('tuning', on);
    if (on) { this.sync(); this.syncLayout(); }
    else if (this.app.cameraViews.view !== 'free') this.app.cameraViews.set('scene');
  }

  // --- posture ----------------------------------------------------------------------------------

  sync() {
    for (const [key, s] of Object.entries(this.inputs)) s.set(this.app.rei.cfg[key]);
    this.markDirty();
  }

  markDirty() {
    const changed = POSE_KEYS.some(k => !same(this.app.rei.cfg[k], this.saved[k]));
    this.panel.classList.toggle('dirty', changed);
    setText(this.status, changed ? 'tuner.status.dirty' : 'tuner.status.clean');
  }

  async save() {
    setText(this.status, 'tuner.status.saving');
    try {
      await api('./api/pose', this.pick(this.app.rei.cfg));
      this.saved = this.pick(this.app.rei.cfg);
      this.sync();
      setText(this.status, 'tuner.status.saved');
    } catch (e) {
      setText(this.status, e instanceof NoServer ? 'tuner.status.failedStatic' : 'tuner.status.failed', { msg: e.message });
    }
  }

  // --- desk layout ----------------------------------------------------------------------------------

  setLayout(partial) {
    const { layout, rei, cameraViews } = this.app;
    layout.set(partial);
    rei.syncKeyboard();
    cameraViews.rebuildGuides();
    if (!cameraViews.inspecting) cameraViews.set('free');   // the baked room can't show the change: look in 3D
    this.syncLayout();
  }

  syncLayout() {
    const { layout } = this.app;
    for (const [key, s] of Object.entries(this.layoutInputs)) s.set(layout.current[key]);
    setText(this.layoutNote, layout.matchesRender ? 'layout.same' : 'layout.differs');
    this.layoutNote.classList.toggle('warn', !layout.matchesRender);
  }

  // the room itself is re-baked in Blender, outside the page
  async saveLayout() {
    setText(this.layoutStatus, 'layout.saving');
    try {
      await api('./api/layout', this.app.layout.current);
      setText(this.layoutStatus, 'layout.saved');
    } catch (e) { setText(this.layoutStatus, 'layout.failed', { msg: e.message }); }
  }

  // --- per frame: arm reach readout -------------------------------------------------------------

  update(dt) {
    if (this.panel.hidden || (this.readoutT += dt) < 0.25) return;
    this.readoutT = 0;
    const { rei, keymap } = this.app;
    const v = new THREE.Vector3(), keyTop = keymap.home.L.pos.y;
    const arms = [rei.arms.left, rei.arms.right];
    const reach = Math.max(...arms.map(a => a.upper.getWorldPosition(v).distanceTo(a.wrist) / (a.l1 + a.l2)));
    const avg = f => (f(arms[0]) + f(arms[1])) / 2;
    const wrist = avg(a => a.hand.getWorldPosition(v).y - keyTop), elbow = avg(a => a.lower.getWorldPosition(v).y - keyTop);
    setText(this.readout, 'tuner.readout', { reach: Math.round(reach * 100), wrist: (wrist * 100).toFixed(1), elbow: (elbow * 100).toFixed(1) });
    this.readout.classList.toggle('warn', reach > 0.95);
  }
}
