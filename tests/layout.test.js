import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutBottles } from '../src/layout.js';

const viewports = [
  { width: 375, height: 667, top: 64 },
  { width: 1280, height: 720, top: 64 },
  { width: 800, height: 1200, top: 64 },
];

for (const viewport of viewports) {
  for (const count of [5, 8, 12, 15]) {
    test(`${viewport.width}x${viewport.height} 擺 ${count} 瓶：全部在畫面內且不重疊`, () => {
      const layout = layoutBottles(count, viewport);
      const { bottleWidth, bottleHeight, slots } = layout;
      assert.equal(slots.length, count);

      for (const slot of slots) {
        assert.ok(slot.x - bottleWidth / 2 >= 0);
        assert.ok(slot.x + bottleWidth / 2 <= viewport.width);
        assert.ok(slot.y >= viewport.top);
        assert.ok(slot.y + bottleHeight <= viewport.height);
      }

      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const apartX = Math.abs(slots[i].x - slots[j].x) >= bottleWidth;
          const apartY = Math.abs(slots[i].y - slots[j].y) >= bottleHeight;
          assert.ok(apartX || apartY, `瓶 ${i} 與 ${j} 重疊`);
        }
      }
    });
  }
}

test('第一排上方保留倒水用的空間', () => {
  const viewport = { width: 1280, height: 720, top: 64 };
  const { bottleHeight, slots } = layoutBottles(6, viewport);
  const firstRowTop = Math.min(...slots.map((slot) => slot.y));
  assert.ok(firstRowTop - viewport.top >= bottleHeight * 0.5);
});
