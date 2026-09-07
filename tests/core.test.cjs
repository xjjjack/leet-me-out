const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AcceptanceTracker, endpoint, isLeetCode, navigationAllowed, chooseProblem } = require('../dist/core');
const submit = 'https://leetcode.com/problems/two-sum/submit/';
const check = 'https://leetcode.com/submissions/detail/123/check/';
const accepted = { state: 'SUCCESS', status_code: 10 };
test('only a newly observed submission can unlock, and only once', () => {
  const t = new AcceptanceTracker(); t.reset();
  assert.equal(t.observe(submit, { submission_id: 123 }, t.epoch), false);
  assert.equal(t.observe(check, { state: 'SUCCESS', status_code: 11 }, t.epoch), false);
  assert.equal(t.observe(check, { state: 'PENDING', status_code: 10 }, t.epoch), false);
  assert.equal(t.observe(check, accepted, t.epoch), true);
  assert.equal(t.observe(check, accepted, t.epoch), false);
});
test('result body can arrive before submission body without losing acceptance', () => {
  const t = new AcceptanceTracker();
  assert.equal(t.observe(check, accepted, t.epoch), false);
  assert.equal(t.observe(submit, { submission_id: 123 }, t.epoch), true);
});
test('old session requests and historical submissions cannot unlock', () => {
  const t = new AcceptanceTracker(); const old = t.epoch;
  t.observe(submit, { submission_id: 123 }, old); t.reset();
  assert.equal(t.observe(check, accepted, old), false);
  assert.equal(t.observe(check, accepted, t.epoch), false);
  t.observe(submit, { submission_id: 123 }, old);
  assert.equal(t.observe(check, accepted, t.epoch), false);
});
test('unrelated, malformed, and spoofed responses are ignored', () => {
  const t = new AcceptanceTracker();
  for (const value of [null, false, 'Accepted', {}, {submission_id: 'not-an-id'}]) assert.equal(t.observe(submit, value, 0), false);
  assert.equal(endpoint('https://leetcode.com.evil.test/problems/a/submit/'), null);
  assert.equal(endpoint('https://leetcode.com/submissions/detail/123/'), null);
  assert.equal(isLeetCode('http://leetcode.com/'), false);
  assert.equal(navigationAllowed('file:///etc/passwd'), false);
  assert.equal(navigationAllowed('https://github.com.evil.test/'), false);
  assert.equal(navigationAllowed('https://github.com/login'), true);
});
test('random selector avoids immediate repeats but allows revisiting solved questions', () => {
  for (let i = 0; i < 100; i++) assert.equal(chooseProblem(['a', 'b'], 'a'), 'b');
  assert.equal(chooseProblem(['a'], 'a'), 'a');
  assert.throws(() => chooseProblem([]));
});
