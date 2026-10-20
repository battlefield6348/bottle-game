import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITY,
  makeBottle,
  pour,
  canPour,
  isComplete,
  isLocked,
  isWon,
  completedColors,
} from '../src/rules.js';

test('倒水會移動頂端所有連續同色單位，受目標剩餘空間限制', () => {
  const enoughRoom = pour([makeBottle([1, 2, 2]), makeBottle([3, 2])], 0, 1);
  assert.deepEqual(enoughRoom.bottles[0].layers, [1]);
  assert.deepEqual(enoughRoom.bottles[1].layers, [3, 2, 2, 2]);
  assert.equal(enoughRoom.amount, 2);

  const limitedRoom = pour([makeBottle([1, 2, 2]), makeBottle([3, 3, 2])], 0, 1);
  assert.deepEqual(limitedRoom.bottles[0].layers, [1, 2]);
  assert.equal(limitedRoom.bottles[1].layers.length, CAPACITY);
  assert.equal(limitedRoom.amount, 1);
});

test('目標頂端顏色不同時不能倒', () => {
  const bottles = [makeBottle([1, 2]), makeBottle([3])];
  assert.equal(canPour(bottles, 0, 1), false);
  assert.equal(pour(bottles, 0, 1), null);
});

test('可以倒進空瓶，不能倒進滿瓶或從空瓶倒出', () => {
  const bottles = [makeBottle([1, 1]), makeBottle([]), makeBottle([2, 3, 2, 1])];
  assert.equal(canPour(bottles, 0, 1), true);
  assert.equal(canPour(bottles, 1, 0), false);
  assert.equal(canPour(bottles, 0, 2), false);
  assert.equal(canPour(bottles, 0, 0), false);
});

test('pour 不會修改原本的狀態', () => {
  const bottles = [makeBottle([1, 1]), makeBottle([])];
  pour(bottles, 0, 1);
  assert.deepEqual(bottles[0].layers, [1, 1]);
  assert.deepEqual(bottles[1].layers, []);
});

test('遮擋層不會被一起倒出，倒完後新的頂層會被揭露', () => {
  const bottles = [makeBottle([2, 2, 2], { hidden: 2 }), makeBottle([])];
  const result = pour(bottles, 0, 1);
  assert.deepEqual(result.bottles[0].layers, [2, 2]);
  assert.equal(result.bottles[0].hidden, 1);
  assert.deepEqual(result.bottles[1].layers, [2]);
});

test('全滿同色瓶視為完成並封蓋，不能再倒出', () => {
  const bottles = [makeBottle([1, 1, 1, 1]), makeBottle([])];
  assert.equal(isComplete(bottles[0]), true);
  assert.equal(canPour(bottles, 0, 1), false);
  assert.deepEqual(completedColors(bottles), new Set([1]));
});

test('綁定色瓶只接受指定顏色', () => {
  const bottles = [makeBottle([1]), makeBottle([2]), makeBottle([], { bound: 2 })];
  assert.equal(canPour(bottles, 0, 2), false);
  assert.equal(canPour(bottles, 1, 2), true);
});

test('鎖鏈瓶在鑰匙顏色完成前不能倒入或倒出', () => {
  const locked = [makeBottle([2, 3], { chain: 1 }), makeBottle([3]), makeBottle([1, 1, 1])];
  assert.equal(isLocked(locked[0], locked), true);
  assert.equal(canPour(locked, 0, 1), false);
  assert.equal(canPour(locked, 1, 0), false);

  const unlocked = [makeBottle([2, 3], { chain: 1 }), makeBottle([3]), makeBottle([1, 1, 1, 1])];
  assert.equal(isLocked(unlocked[0], unlocked), false);
  assert.equal(canPour(unlocked, 0, 1), true);
});

test('冰凍瓶需要完成指定數量的顏色才解凍', () => {
  const frozen = [makeBottle([2], { ice: 2 }), makeBottle([]), makeBottle([1, 1, 1, 1])];
  assert.equal(isLocked(frozen[0], frozen), true);

  const thawed = [...frozen, makeBottle([3, 3, 3, 3])];
  assert.equal(isLocked(thawed[0], thawed), false);
});

test('所有瓶子都是空瓶或已完成時勝利', () => {
  assert.equal(isWon([makeBottle([1, 1, 1, 1]), makeBottle([])]), true);
  assert.equal(isWon([makeBottle([1, 1, 1]), makeBottle([1])]), false);
});
