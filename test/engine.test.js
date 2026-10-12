'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const names = (q) => E.voice(E.parseNotes(q).notes).map((n) => n.name);
const best = (q) => E.analyze(q).candidates[0]?.name;

test('parses katakana, hiragana, letters and accidentals', () => {
  assert.deepEqual(names('ファシ♭ド'), ['F', 'B♭', 'C']);
  assert.deepEqual(names('れふぁ#ら'), ['D', 'F♯', 'A']);
  assert.deepEqual(names('ソᵇシド'), ['G♭', 'B', 'C']);
  assert.deepEqual(names('AbCEb'), ['A♭', 'C', 'E♭']);
  assert.deepEqual(names('ＣＥＧ'), ['C', 'E', 'G']);
});

test('lowercase-only input treats b as the note B; uppercase input treats it as a flat', () => {
  assert.deepEqual(names('gbd'), ['G', 'B', 'D']);
  assert.deepEqual(names('EbGBb'), ['E♭', 'G', 'B♭']);
  assert.deepEqual(names('CEbGbBbb'), ['C', 'E♭', 'G♭', 'B♭♭']);
});

test('reports unknown characters', () => {
  assert.deepEqual(E.parseNotes('cXeg').unknown, ['X']);
});

test('voices notes upward unless octaves are given', () => {
  const v = E.voice(E.parseNotes('EGC').notes);
  assert.deepEqual(v.map((n) => n.midi), [52, 55, 60]);
  const w = E.voice(E.parseNotes('G4 C3').notes);
  assert.deepEqual(w.map((n) => n.name + n.octave), ['C3', 'G4']);
});

test('identifies common chords', () => {
  const cases = {
    ceg: 'C', acEg: 'Am7', ceGa: 'C6', EGC: 'C/E', GBDF: 'G7', DFAC: 'Dm7',
    BbDFA: 'B♭M7', EGBbD: 'Em7(♭5)', CEbGbBbb: 'Cdim7',
    'C E G Bb D': 'C7(9)', 'C E G Bb D#': 'C7(♯9)', CFGBb: 'C7sus4', CDG: 'Csus2',
    'C E G# ': 'Caug', 'C Eb G B': 'CmM7', 'C E G B D F#': 'CM7(9,♯11)',
    'D F A C E G': 'Dm7(9,11)', 'C E Bb': 'C7(omit5)', 'C G': 'C5',
  };
  for (const [q, want] of Object.entries(cases)) {
    assert.equal(best(q), want, q);
  }
});

test('lists slash-chord alternatives with lower scores', () => {
  const c = E.analyze('ceg').candidates;
  assert.equal(c[0].cost, 0);
  assert.ok(c.some((x) => x.name === 'Em(omit5)/C'));
});

test('spelled interval names', () => {
  const [c, e, g, fs, gb] = E.parseNotes('C E G F# Gb').notes;
  assert.equal(E.intervalName(c, e), '長3度');
  assert.equal(E.intervalName(c, g), '完全5度');
  assert.equal(E.intervalName(c, fs), '増4度');
  assert.equal(E.intervalName(c, gb), '減5度');
});

const offsets = (q, opts) => {
  const r = E.analyze(q);
  return E.tune(r.notes, r.candidates[0], opts);
};
const round = (x) => Math.round(x * 10) / 10;

test('5-limit major triad: root 0, third -13.7, fifth +2.0, ratio 4:5:6', () => {
  const t = offsets('ceg');
  assert.deepEqual(t.rows.map((r) => round(r.offset)), [0, -13.7, 2]);
  assert.deepEqual(t.ints, [4, 5, 6]);
});

test('minor seventh is 10:12:15:18', () => {
  assert.deepEqual(offsets('acEg').ints, [10, 12, 15, 18]);
});

test('dominant seventh: 16/9 in 5-limit, 7/4 in 7-limit, 16/9 in Pythagorean', () => {
  assert.deepEqual(offsets('GBDF').rows[3].ratio, [16, 9]);
  assert.deepEqual(offsets('GBDF', { mode: 'just7' }).ints, [4, 5, 6, 7]);
  const p = offsets('GBDF', { mode: 'pyth' });
  assert.deepEqual(p.rows[1].ratio, [81, 64]);
  assert.equal(round(p.rows[1].offset), 7.8);
});

test('reference modes shift every note by the same amount', () => {
  const bass = offsets('EGC', { ref: 'bass' });
  assert.equal(round(bass.rows[0].offset), 0);
  assert.equal(round(bass.rows[2].offset), 13.7);
  // Am in C major: A = 5/3 above C → −15.6
  const key = offsets('ace', { ref: 'key', tonic: 0 });
  assert.equal(round(key.rows[0].offset), -15.6);
});

test('overrides pick another ratio for a row', () => {
  const t = offsets('ceg', { overrides: { 1: 1 } });
  assert.deepEqual(t.rows[1].ratio, [81, 64]);
  assert.equal(t.rows[1].isDefault, false);
});

test('frequencies follow A4', () => {
  const t = offsets('A4 C#5 E5', { a4: 442 });
  assert.equal(round(t.rows[0].freqJI), 442);
  assert.equal(round(t.rows[1].freqJI), 552.5);
});
