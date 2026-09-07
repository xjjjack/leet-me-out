const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readSignedIn } = require('../dist/auth');
test('signed-in status is verified, not inferred from an old cookie', async () => {
  const ses = value => ({ cookies: { get: async () => [{ value: 'test-cookie' }] }, fetch: async () => ({ ok: true, json: async () => ({ data: { userStatus: { isSignedIn: value } } }) }) });
  assert.equal(await readSignedIn(ses(true)), true);
  assert.equal(await readSignedIn(ses(false)), false);
  assert.equal(await readSignedIn(ses(undefined)), null);
});
test('logged-out and unavailable states keep sign in available', async () => {
  assert.equal(await readSignedIn({ cookies: { get: async () => [] }, fetch: () => { throw new Error('Should not fetch'); } }), false);
  assert.equal(await readSignedIn({ cookies: { get: async () => [{value:'test'}] }, fetch: async () => { throw new Error('Offline'); } }), null);
});
