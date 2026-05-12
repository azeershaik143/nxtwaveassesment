const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword } = require('../src/lib/auth');

test('password hashing round-trip', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(hash !== 'correct horse battery staple');
  assert.strictEqual(await verifyPassword('correct horse battery staple', hash), true);
  assert.strictEqual(await verifyPassword('wrong', hash), false);
});
