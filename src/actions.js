// Things that happen in the room, shared by the terminal commands, clicks and the keyboard.
// Rei does not speak: her reactions are looks, faces and gestures.
import { DRINK } from './rei/pose.js';

export const CRT_COLORS = {
  green: [0.25, 1.0, 0.55], amber: [1.0, 0.62, 0.16], blue: [0.35, 0.62, 1.0],
  pink: [1.0, 0.38, 0.72], purple: [0.66, 0.42, 1.0], white: [0.86, 0.9, 1.0],
};
const CRT_ORDER = Object.keys(CRT_COLORS);

export function createActions(app) {
  const { rei, room, sound, crt, glow, can } = app;
  let crtIndex = 0;

  const actions = {
    // one key under Rei's finger: hands, glow and click
    pressKey(code) {
      const key = rei.press(code);
      if (key) glow.flash(key);
      sound.key(code);
      return key;
    },

    // reach, lift, sip, put it back (about 7 s); false if her hands are busy or she is asleep
    drink() {
      if (!can || rei.asleep || rei.handsBusy) return false;
      rei.play('drink', DRINK.dur);
      rei.lookAt('can', DRINK.grab + 0.25);
      return true;
    },

    // touching the can when she can't drink right now
    tapCan() {
      if (actions.drink()) return;
      sound.can();
      rei.lookAt('can', 2.2);
      rei.emote('relaxed', 0.6, 2.5);
    },

    setLamp(on) {
      room.target.lamp = on ? 1 : 0;
      sound.switchClick();
      rei.lookAt('lamp', 1.6);
    },
    get lampOn() { return room.target.lamp > 0.5; },

    setCeiling(on) {
      if (actions.ceilingOn === on) return;
      room.target.ceil = on ? 1 : 0;
      sound.switchClick();
      document.body.classList.toggle('lights', on);
      if (on) { rei.play('flinch', 1.6); rei.emote('surprised', 0.7, 1.0); rei.lookAt('up', 1.2); }
      else rei.emote('relaxed', 0.7, 2.5);
    },
    get ceilingOn() { return room.target.ceil > 0.5; },

    // dawn: the sky brightens, she watches it, yawns, and the lamp goes out
    setDawn(on) {
      if ((room.target.day > 0.5) === on) return;
      room.target.day = on ? 1 : 0;
      if (!on) { room.target.lamp = 1; return; }
      room.target.ceil = 0;
      document.body.classList.remove('lights');
      rei.lookAt('window', 7);
      app.later(7, () => rei.play('yawn', 3.2));
      app.later(13, () => rei.emote('relaxed', 0.6, 5));
      app.later(15, () => { room.target.lamp = 0; });
    },

    setCrtColor(name) {
      const rgb = CRT_COLORS[name];
      if (!rgb) return false;
      crtIndex = CRT_ORDER.indexOf(name);
      room.crtColorTarget.setRGB(...rgb);
      room.crtPulse = 3;
      sound.degauss();
      rei.emote('relaxed', 0.6, 2);
      return true;
    },
    // the colour a click on the CRT switches to
    nextCrtName() { return CRT_ORDER[(crtIndex + 1) % CRT_ORDER.length]; },

    penguins() {
      sound.squeak();
      rei.lookAt('penguin', 2.6);
    },

    patHead() {
      rei.play('tilt', 1.8);
      rei.lookAt('viewer', 3);
      sound.tone({ freq: 880, to: 1320, dur: 0.18, gain: 0.05 });
    },

    poke() {
      rei.play('flinch', 1.0);
      rei.emote('surprised', 0.7, 1.0);
      rei.lookAt('viewer', 2.5);
    },

    // the CRT powering up when you enter the room
    powerOn() {
      room.crtPulse = 4;
      sound.degauss();
      crt.powerOn();
    },
  };

  rei.onCan = what => {
    if (what === 'lift') { sound.canTap(0.5); rei.lookAt('screen', DRINK.sipEnd - DRINK.grab + 0.3); }
    else if (what === 'sip') { rei.emote('relaxed', 0.75, DRINK.sipEnd - DRINK.lifted); [0, 0.6, 1.2].forEach(d => app.later(d, () => sound.sip())); }
    else if (what === 'down') { sound.canTap(1); rei.lookAt('can', 0.5); }
  };

  return actions;
}
