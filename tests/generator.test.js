import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPACITY, pour, isWon, isComplete } from '../src/rules.js';
import { generateLevel, levelConfig } from '../src/generator.js';

function replayWins(bottles, moves) {
  let current = bottles;
  for (const [from, to] of moves) {
    const result = pour(current, from, to);
    if (!result) return false;
    current = result.bottles;
  }
  return isWon(current);
}

test('相同關卡與種子會產生相同盤面', () => {
  const first = generateLevel(7, 12345);
  const second = generateLevel(7, 12345);
  assert.deepEqual(first.bottles, second.bottles);
});

test('不同種子會產生不同盤面', () => {
  const first = generateLevel(7, 1);
  const second = generateLevel(7, 2);
  assert.notDeepEqual(first.bottles, second.bottles);
});

test('每個顏色剛好出現 CAPACITY 次，且開局沒有已完成的瓶子', () => {
  const { bottles } = generateLevel(15, 99);
  const counts = new Map();
  for (const bottle of bottles) {
    // 不論底層是否被遮擋，開局都不該有整瓶同色的瓶子
    const uniformFull = bottle.layers.length === CAPACITY && bottle.layers.every((c) => c === bottle.layers[0]);
    assert.equal(uniformFull, false);
    for (const color of bottle.layers) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  for (const count of counts.values()) assert.equal(count, CAPACITY);
});

test('難度隨關卡遞增：顏色數不減少，且逐步解鎖特殊機制', () => {
  let previousColors = 0;
  for (let level = 1; level <= 60; level++) {
    const config = levelConfig(level);
    assert.ok(config.colors >= previousColors);
    previousColors = config.colors;
  }
  const first = levelConfig(1);
  assert.equal(first.hiddenBottles + first.boundBottles + first.chainBottles + first.iceBottles, 0);
  const late = levelConfig(40);
  assert.ok(late.hiddenBottles > 0);
  assert.ok(late.boundBottles > 0);
  assert.ok(late.chainBottles > 0);
  assert.ok(late.iceBottles > 0);
});

test('產生的關卡附帶可重播的解法（保證有解）', () => {
  for (const seed of [1, 2024]) {
    for (let level = 1; level <= 45; level += 2) {
      const { bottles, solution } = generateLevel(level, seed);
      assert.ok(replayWins(bottles, solution), `level ${level} seed ${seed} 的解法無效`);
    }
  }
});

test('高關卡盤面確實包含特殊瓶', () => {
  const { bottles } = generateLevel(40, 7);
  assert.ok(bottles.some((bottle) => bottle.hidden > 0));
  assert.ok(bottles.some((bottle) => bottle.bound !== null));
  assert.ok(bottles.some((bottle) => bottle.chain !== null || bottle.ice > 0));
});

test('遮擋瓶最多佔顏色瓶的四分之三，保留可推理的資訊', () => {
  for (let level = 1; level <= 80; level++) {
    const config = levelConfig(level);
    assert.ok(config.hiddenBottles <= Math.ceil(config.colors * 0.75), `level ${level}`);
  }
});
