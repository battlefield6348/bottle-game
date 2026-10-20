import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  polygonArea,
  clipBelow,
  rotatePoints,
  levelForVolume,
  makeBottleShape,
  makePourProfile,
} from '../src/geometry.js';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

function near(actual, expected, tolerance = 1e-3) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} 不接近 ${expected}`);
}

test('多邊形面積', () => {
  near(polygonArea(square), 100);
});

test('保留水平線以下（y 較大）的部分', () => {
  near(polygonArea(clipBelow(square, 4)), 60);
  near(polygonArea(clipBelow(square, -5)), 100);
  near(polygonArea(clipBelow(square, 20)), 0);
});

test('旋轉 90 度後面積不變且座標正確', () => {
  const rotated = rotatePoints([{ x: 1, y: 0 }], Math.PI / 2);
  near(rotated[0].x, 0);
  near(rotated[0].y, 1);
  near(polygonArea(rotatePoints(square, 0.7)), 100);
});

test('依水量求液面高度', () => {
  near(levelForVolume(square, 30), 7);
  near(levelForVolume(square, 100), 0);
});

test('圓底瓶身面積符合解析解', () => {
  const width = 40;
  const height = 120;
  const shape = makeBottleShape(width, height, 64);
  const radius = width / 2;
  near(polygonArea(shape), width * (height - radius) + (Math.PI * radius * radius) / 2, 1);
});

test('傾倒角度：水越少倒得越斜，且該角度下的容量剛好等於水量', () => {
  const profile = makePourProfile(makeBottleShape(40, 120, 48), 8);
  const full = profile.angleForVolume(profile.fullVolume);
  const half = profile.angleForVolume(profile.fullVolume / 2);
  const almostEmpty = profile.angleForVolume(profile.fullVolume * 0.05);
  assert.ok(full > 0);
  assert.ok(full < half && half < almostEmpty);
  near(profile.capacityAtAngle(half), profile.fullVolume / 2, profile.fullVolume * 0.01);
});
