import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHalloween } from '../src/season.js';

test('10 月與 11/1 自動開啟萬聖節主題', () => {
  assert.equal(isHalloween(new Date(2026, 9, 1)), true);
  assert.equal(isHalloween(new Date(2026, 9, 31)), true);
  assert.equal(isHalloween(new Date(2026, 10, 1)), true);
  assert.equal(isHalloween(new Date(2026, 10, 2)), false);
  assert.equal(isHalloween(new Date(2026, 8, 30)), false);
});

test('網址參數可強制開關主題', () => {
  assert.equal(isHalloween(new Date(2026, 5, 1), '?theme=halloween'), true);
  assert.equal(isHalloween(new Date(2026, 9, 31), '?theme=default'), false);
});
