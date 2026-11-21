import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function roll(serverSeed: string, clientSeed: string, nonce: number) {
  const digest = crypto.createHash('sha256').update(`${serverSeed}:${clientSeed}:${nonce}`).digest('hex');
  return parseInt(digest.slice(0, 8), 16) / 0xffffffff;
}

test('provably fair roll is deterministic for seed and nonce', () => {
  const serverSeed = 'a'.repeat(64);
  const first = roll(serverSeed, 'browser-seed', 7);
  const second = roll(serverSeed, 'browser-seed', 7);
  assert.equal(first, second);
  assert.ok(first >= 0 && first <= 1);
});

test('changing nonce changes the roll', () => {
  const serverSeed = 'b'.repeat(64);
  assert.notEqual(roll(serverSeed, 'browser-seed', 1), roll(serverSeed, 'browser-seed', 2));
});
