const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusPolicy } = require('../dist/policy');
test('focus persists across restart, but permission to close does not', () => {
  const p = new FocusPolicy(); p.enable('practice', false); p.accepted();
  assert.equal(p.enabled, true); assert.equal(p.mayClose, true);
  const stored = p.export(); assert.equal(JSON.stringify(stored).includes('practice'), false);
  const next = new FocusPolicy(); next.restore(stored);
  assert.equal(next.enabled, true); assert.equal(next.mayClose, false);
  assert.equal(next.verify('practice'), 'valid'); assert.equal(next.enabled, true);
});
test('password is mandatory and incorrect passwords do not disable focus', () => {
  const p = new FocusPolicy(); assert.throws(() => p.enable('', false));
  p.enable('practice', false);
  for (let i = 0; i < 11; i++) assert.equal(p.verify('wrong'), 'invalid');
  assert.equal(p.enabled, true);
});
test('opt-in recovery persists failed attempts and triggers exactly at ten', () => {
  const p = new FocusPolicy(); p.enable('practice', true);
  for (let i = 0; i < 9; i++) assert.equal(p.verify('wrong'), 'invalid');
  assert.equal(p.enabled, true);
  const next = new FocusPolicy(); next.restore(p.export());
  assert.equal(next.verify('wrong'), 'recovered');
  assert.equal(next.enabled, false); assert.equal(next.password.enabled, false);
});
test('correct password resets the recovery counter without switching focus off', () => {
  const p = new FocusPolicy(); p.enable('practice', true); p.verify('wrong');
  assert.equal(p.verify('practice'), 'valid'); assert.equal(p.failures, 0); assert.equal(p.enabled, true);
});
