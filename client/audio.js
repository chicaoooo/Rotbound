// Sons sintetizados com WebAudio (sem ficheiros). Cada tipo de zombie tem o seu som.
let ctx = null, master = null, noiseBuf = null;
export let volume = 0.6;
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
function init() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(type, f0, f1, dur, vol, pan = 0, delay = 0) {
  const t = ctx.currentTime + delay; const o = ctx.createOscillator(); const g = ctx.createGain(); const p = ctx.createStereoPanner();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur); p.pan.value = pan; o.connect(g).connect(p).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq = 1200, q = 1, pan = 0, type = 'lowpass', delay = 0) {
  const t = ctx.currentTime + delay; const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = pan;
  env(g, t, 0.003, vol, dur); s.connect(f).connect(g).connect(p).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function groan(f, dur, vol, pan, rough = 30) {
  const t = ctx.currentTime; const o = ctx.createOscillator(); const lfo = ctx.createOscillator(); const lg = ctx.createGain();
  const g = ctx.createGain(); const p = ctx.createStereoPanner(); const fl = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.7, t + dur);
  lfo.frequency.value = rough; lg.gain.value = f * 0.15; lfo.connect(lg).connect(o.frequency);
  fl.type = 'lowpass'; fl.frequency.value = f * 4; p.pan.value = pan;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(fl).connect(g).connect(p).connect(master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
}

const SOUNDS = {
  swing: (v, p) => noise(0.08, 0.12 * v, 2500, 1, p, 'bandpass'),
  hit: (v, p) => { noise(0.07, 0.25 * v, 800, 1, p); tone('square', 180, 60, 0.06, 0.08 * v, p); },
  crit: (v, p) => { noise(0.1, 0.3 * v, 1200, 1, p); tone('square', 400, 90, 0.1, 0.12 * v, p); },
  shot_pistola: (v, p) => { noise(0.15, 0.5 * v, 3000, 0.7, p); tone('square', 220, 50, 0.08, 0.15 * v, p); },
  shot_cacadeira: (v, p) => { noise(0.35, 0.7 * v, 1500, 0.6, p); tone('sawtooth', 120, 30, 0.2, 0.2 * v, p); },
  shot_espingarda: (v, p) => { noise(0.09, 0.4 * v, 3500, 0.7, p); tone('square', 260, 70, 0.05, 0.1 * v, p); },
  shot_torre: (v, p) => { noise(0.08, 0.3 * v, 4000, 0.8, p); },
  shot_arco: (v, p) => { tone('triangle', 500, 200, 0.12, 0.12 * v, p); noise(0.1, 0.08 * v, 4000, 2, p, 'bandpass'); },
  boom: (v, p) => { noise(0.9, 0.9 * v, 400, 0.5, p); tone('sine', 90, 25, 0.7, 0.5 * v, p); },
  break: (v, p) => { noise(0.25, 0.35 * v, 900, 0.8, p); tone('square', 140, 50, 0.15, 0.1 * v, p); },
  chip: (v, p) => noise(0.05, 0.12 * v, 1800, 2, p, 'bandpass'),
  bite: (v, p) => { noise(0.12, 0.35 * v, 600, 2, p); tone('sawtooth', 200, 90, 0.1, 0.1 * v, p); },
  hurt: () => { tone('sawtooth', 180, 80, 0.2, 0.18); noise(0.15, 0.2, 500); },
  place: (v, p) => { tone('square', 140, 90, 0.07, 0.1 * v, p); noise(0.06, 0.1 * v, 700, 1, p); },
  craft: () => { tone('triangle', 520, 520, 0.08, 0.1); tone('triangle', 780, 780, 0.1, 0.1, 0, 0.08); },
  pickup: () => tone('triangle', 660, 990, 0.08, 0.08),
  eat: () => { noise(0.08, 0.12, 900, 3, 0, 'bandpass'); noise(0.08, 0.12, 900, 3, 0, 'bandpass', 0.12); },
  click: (v, p) => tone('square', 1800, 1800, 0.02, 0.08 * v, p),
  reload: (v, p) => { tone('square', 900, 600, 0.04, 0.08 * v, p); tone('square', 700, 1100, 0.05, 0.08 * v, p, 0.25); },
  spit: (v, p) => { noise(0.2, 0.25 * v, 1400, 4, p, 'bandpass'); },
  acid: (v, p) => noise(0.25, 0.2 * v, 3000, 1, p, 'highpass'),
  fire: (v, p) => noise(0.8, 0.3 * v, 700, 0.6, p),
  door: (v, p) => tone('sawtooth', 90, 140, 0.15, 0.08 * v, p),
  dodge: () => noise(0.12, 0.1, 1800, 1, 0, 'bandpass'),
  repair: (v, p) => { tone('square', 900, 700, 0.05, 0.1 * v, p); },
  alarm: () => { for (let i = 0; i < 3; i++) tone('triangle', 440, 330, 0.35, 0.14, 0, i * 0.45); },
  horde: () => groan(70, 1.6, 0.12, 0, 9),
  roar: () => { groan(55, 2.0, 0.3, 0, 14); noise(1.5, 0.15, 300); },
  shout: () => { tone('sawtooth', 220, 330, 0.4, 0.12); },
  victory: () => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.4, 0.15, 0, i * 0.18)); },
  die: (v, p) => groan(90, 0.6, 0.12 * v, p, 20),
  groan_errante: (v, p) => groan(95 + Math.random() * 25, 1.1, 0.07 * v, p, 7),
  groan_corredor: (v, p) => groan(220 + Math.random() * 40, 0.45, 0.07 * v, p, 40),
  groan_brutamontes: (v, p) => groan(48, 1.4, 0.14 * v, p, 6),
  groan_cuspidor: (v, p) => { groan(140, 0.7, 0.06 * v, p, 25); noise(0.3, 0.05 * v, 2000, 3, p, 'bandpass'); },
  groan_explosivo: (v, p) => { groan(120, 0.6, 0.06 * v, p, 60); tone('sine', 900, 900, 0.05, 0.04 * v, p); },
  groan_escavador: (v, p) => { noise(0.6, 0.08 * v, 300, 1, p); groan(80, 0.6, 0.05 * v, p, 12); },
  groan_rei: (v, p) => groan(40, 2.2, 0.25 * v, p, 5),
};
export function play(name, vol = 1, pan = 0) {
  if (!ctx || !SOUNDS[name] || volume <= 0) return;
  try { SOUNDS[name](vol, Math.max(-1, Math.min(1, pan))); } catch {}
}
