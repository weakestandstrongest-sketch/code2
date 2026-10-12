/* Chord Finder JI — Web Audio で和音を鳴らす（うなりが聞こえるよう倍音を含む音色） */
(function (global) {
  'use strict';

  let ctx = null;
  let wave = null;
  let out = null;
  let voices = [];
  let timers = [];

  function ensure() {
    if (!ctx) {
      // iOS Safari 16.4+: 消音スイッチがオンでも鳴らせるようにする
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* noop */ }
      const AC = global.AudioContext || global.webkitAudioContext;
      ctx = new AC();
      const n = 12;
      const real = new Float32Array(n + 1);
      const imag = new Float32Array(n + 1);
      for (let k = 1; k <= n; k++) imag[k] = 1 / Math.pow(k, 1.4);
      wave = ctx.createPeriodicWave(real, imag);
      const comp = ctx.createDynamicsCompressor();
      out = ctx.createGain();
      out.gain.value = 0.9;
      out.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function schedule(freqs, start, dur) {
    const level = 0.32 / Math.sqrt(freqs.length);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.setPeriodicWave(wave);
      o.frequency.value = f;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(level, start + 0.03);
      g.gain.setValueAtTime(level, start + dur - 0.12);
      g.gain.linearRampToValueAtTime(0, start + dur);
      o.connect(g);
      g.connect(out);
      o.start(start);
      o.stop(start + dur + 0.05);
      voices.push({ o, g });
    }
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of voices) {
      try {
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(0, t, 0.02);
        v.o.stop(t + 0.15);
      } catch (e) { /* already stopped */ }
    }
    voices = [];
  }

  /**
   * steps: [{ freqs, dur, label }] を順番に鳴らす。onStep(label|null) で進行を通知。
   */
  function playSequence(steps, onStep) {
    ensure();
    stop();
    let t = ctx.currentTime + 0.05;
    let delay = 50;
    for (const s of steps) {
      schedule(s.freqs, t, s.dur);
      const label = s.label;
      timers.push(setTimeout(() => onStep && onStep(label), delay));
      t += s.dur + 0.12;
      delay += (s.dur + 0.12) * 1000;
    }
    timers.push(setTimeout(() => onStep && onStep(null), delay));
  }

  global.ChordAudio = { playSequence, stop };
})(window);
