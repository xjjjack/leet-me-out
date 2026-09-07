const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusPolicy } = require('../dist/policy');
test('focus persists across restart, but permission to close does not', () => {
  const p = new FocusPolicy(); p.enable('practice'); p.accepted();
  assert.equal(p.enabled, true); assert.equal(p.mayClose, true);
  const stored = p.export(); assert.equal(JSON.stringify(stored).includes('practice'), false);
  const next = new FocusPolicy(); next.restore(stored);
  assert.equal(next.enabled, true); assert.equal(next.mayClose, false);
  assert.equal(next.verify('practice'), 'valid'); assert.equal(next.enabled, true);
});
test('password is mandatory and incorrect passwords do not disable focus', () => {
  const p = new FocusPolicy(); assert.throws(() => p.enable(''));
  p.enable('practice');
  for (let i = 0; i < 9; i++) assert.equal(p.verify('wrong'), 'invalid');
  assert.equal(p.enabled, true);
});
test('recovery persists failed attempts and triggers exactly at ten', () => {
  const p = new FocusPolicy(); p.enable('practice');
  for (let i = 0; i < 9; i++) assert.equal(p.verify('wrong'), 'invalid');
  assert.equal(p.enabled, true);
  const next = new FocusPolicy(); next.restore(p.export());
  assert.equal(next.verify('wrong'), 'recovered');
  assert.equal(next.enabled, false); assert.equal(next.password.enabled, false);
});
test('correct password resets the recovery counter without switching focus off', () => {
  const p = new FocusPolicy(); p.enable('practice'); p.verify('wrong');
  assert.equal(p.verify('practice'), 'valid'); assert.equal(p.failures, 0); assert.equal(p.enabled, true);
});
test('shortcut permission never counts as solving and is consumed on a new session', () => {
  const p = new FocusPolicy(); p.enable('practice'); p.permitClose();
  assert.equal(p.mayClose, true); assert.equal(p.solved, false);
  p.accepted(); assert.equal(p.solved, true);
  p.newSession(); assert.equal(p.mayClose, false); assert.equal(p.solved, false);
  assert.equal(p.enabled, true);
});
