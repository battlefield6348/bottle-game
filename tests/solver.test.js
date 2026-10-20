import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBottle, pour, isWon } from '../src/rules.js';
import { solve } from '../src/solver.js';

function replay(bottles, moves) {
  let current = bottles;
  for (const [from, to] of moves) {
    const result = pour(current, from, to);
    assert.ok(result, `無效步驟 ${from}->${to}`);
    current = result.bottles;
  }
  return current;
}

test('已勝利的盤面回傳空解', () => {
  const result = solve([makeBottle([1, 1, 1, 1]), makeBottle([])]);
  assert.deepEqual(result.moves, []);
});

test('找出的解可以實際重播並獲勝', () => {
  const bottles = [
    makeBottle([1, 2, 1, 2]),
    makeBottle([2, 1, 2, 1]),
    makeBottle([]),
    makeBottle([]),
  ];
  const result = solve(bottles);
  assert.ok(result.moves);
  assert.equal(isWon(replay(bottles, result.moves)), true);
});

test('無解盤面回傳 null 步驟', () => {
  const bottles = [makeBottle([1, 2, 1, 2]), makeBottle([2, 1, 2, 1])];
  assert.equal(solve(bottles).moves, null);
});

test('求解器會遵守遮擋、綁定、鎖鏈與冰凍規則', () => {
  const bottles = [
    makeBottle([2, 1, 2, 1], { hidden: 3 }),
    makeBottle([1, 2, 1, 2], { chain: 3 }),
    makeBottle([3, 3, 3], { ice: 0 }),
    makeBottle([3], { ice: 0 }),
    makeBottle([], { bound: 1 }),
    makeBottle([]),
  ];
  const result = solve(bottles);
  assert.ok(result.moves);
  assert.equal(isWon(replay(bottles, result.moves)), true);
});

test('超過節點上限時放棄並標記為未完成搜尋', () => {
  const bottles = [
    makeBottle([1, 2, 3, 4]),
    makeBottle([4, 3, 2, 1]),
    makeBottle([2, 4, 1, 3]),
    makeBottle([3, 1, 4, 2]),
    makeBottle([]),
    makeBottle([]),
  ];
  const result = solve(bottles, { nodeLimit: 3 });
  assert.equal(result.moves, null);
  assert.equal(result.exhausted, false);
});
