import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBottle, pour, isWon } from '../src/rules.js';
import { solve, solveShortest } from '../src/solver.js';
import { generateLevel } from '../src/generator.js';

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

// 不做任何剪枝的廣度優先搜尋，作為最短步數的標準答案。
function bruteForceShortest(bottles) {
  const key = (state) => JSON.stringify(state);
  const seen = new Set([key(bottles)]);
  let frontier = [bottles];
  for (let depth = 0; frontier.length > 0; depth++) {
    const next = [];
    for (const state of frontier) {
      if (isWon(state)) return depth;
      for (let from = 0; from < state.length; from++) {
        for (let to = 0; to < state.length; to++) {
          const result = pour(state, from, to);
          if (!result || seen.has(key(result.bottles))) continue;
          seen.add(key(result.bottles));
          next.push(result.bottles);
        }
      }
    }
    frontier = next;
  }
  return null;
}

test('最短解的步數與暴力廣度優先搜尋一致', () => {
  for (let seed = 1; seed <= 6; seed++) {
    for (const level of [1, 2, 3, 4]) {
      const { bottles } = generateLevel(level, seed);
      const result = solveShortest(bottles);
      assert.ok(result.moves, `level ${level} seed ${seed}`);
      assert.equal(isWon(replay(bottles, result.moves)), true);
      assert.equal(result.moves.length, bruteForceShortest(bottles), `level ${level} seed ${seed}`);
    }
  }
});

test('最短解遵守特殊瓶規則且不比深度優先解長', () => {
  const bottles = [
    makeBottle([2, 1, 2, 1], { hidden: 3 }),
    makeBottle([1, 2, 1, 2], { chain: 3 }),
    makeBottle([3, 3, 3], { ice: 0 }),
    makeBottle([3], { ice: 0 }),
    makeBottle([], { bound: 1 }),
    makeBottle([]),
  ];
  const result = solveShortest(bottles);
  assert.ok(result.moves);
  assert.equal(isWon(replay(bottles, result.moves)), true);
  assert.ok(result.moves.length <= solve(bottles).moves.length);
});

test('最短解：無解盤面標記為已窮舉，超過上限則標記為未完成', () => {
  const unsolvable = solveShortest([makeBottle([1, 2, 1, 2]), makeBottle([2, 1, 2, 1])]);
  assert.equal(unsolvable.moves, null);
  assert.equal(unsolvable.exhausted, true);

  const { bottles } = generateLevel(20, 1);
  const limited = solveShortest(bottles, { nodeLimit: 1 });
  assert.equal(limited.moves, null);
  assert.equal(limited.exhausted, false);
});
