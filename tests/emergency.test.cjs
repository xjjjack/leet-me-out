const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EmergencyPassword, validShortcut, matchesShortcut } = require('../dist/emergency');
test('optional password accepts correct input, rejects wrong input, and clears between sessions', () => {
  const password = new EmergencyPassword();
  assert.equal(password.enabled, false);
  password.set('练习-time'); assert.equal(password.enabled, true);
  assert.equal(password.verify('wrong'), false); assert.equal(password.verify('练习-time'), true);
  password.clear(); assert.equal(password.enabled, false); assert.equal(password.verify(''), true);
  assert.throws(() => password.set('x'.repeat(129)));
});
test('custom shortcuts require modifiers and match exact input on each platform', () => {
  assert.equal(validShortcut('Control+Alt+K'), true); assert.equal(validShortcut('Command+Shift+F8'), true);
  assert.equal(validShortcut('Shift+U'), false); assert.equal(validShortcut('Control+Alt+Delete'), false);
  assert.equal(validShortcut('Control+Control+K'), false);
  const input = { key:'u',control:true,meta:false,alt:false,shift:true };
  assert.equal(matchesShortcut('CommandOrControl+Shift+U', input, false), true);
  assert.equal(matchesShortcut('CommandOrControl+Shift+U', input, true), false);
  assert.equal(matchesShortcut('Control+U', input, false), false);
});
