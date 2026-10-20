// 畫面座標系：y 向下為正，角度為正時順時針旋轉。

export function polygonArea(points) {
  let doubled = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    doubled += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doubled) / 2;
}

// Sutherland–Hodgman 單一半平面裁切：保留 y >= lineY（水平線以下）的部分。
export function clipBelow(points, lineY) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const currentInside = current.y >= lineY;
    const nextInside = next.y >= lineY;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const t = (lineY - current.y) / (next.y - current.y);
      result.push({ x: current.x + (next.x - current.x) * t, y: lineY });
    }
  }
  return result;
}

export function rotatePoints(points, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
}

function bisect(low, high, isTooLow, iterations = 32) {
  for (let i = 0; i < iterations; i++) {
    const middle = (low + high) / 2;
    if (isTooLow(middle)) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// 回傳水平液面的 y，使液面以下的多邊形面積等於 volume。
export function levelForVolume(points, volume) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { y } of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // 液面越往下（y 越大），下方面積越小；面積仍大於目標時代表液面該再往下。
  return bisect(minY, maxY, (y) => polygonArea(clipBelow(points, y)) > volume);
}

// 瓶身內腔：原點在瓶口中心，瓶底為半圓。
export function makeBottleShape(width, height, arcSegments = 24) {
  const radius = width / 2;
  const points = [
    { x: -radius, y: 0 },
    { x: radius, y: 0 },
  ];
  for (let i = 0; i <= arcSegments; i++) {
    const angle = (Math.PI * i) / arcSegments;
    points.push({ x: radius * Math.cos(angle), y: height - radius + radius * Math.sin(angle) });
  }
  return points;
}

const MAX_POUR_ANGLE = (Math.PI * 5) / 6;

// 向右倒時以右側瓶口為支點；向左倒時瓶身左右對稱，取負角即可。
export function makePourProfile(shape, headroom) {
  const lip = shape.reduce((best, point) => (point.y <= best.y && point.x >= best.x ? point : best));
  const fullVolume = polygonArea(clipBelow(shape, headroom));

  function capacityAtAngle(angle) {
    const rotated = rotatePoints(shape, angle);
    const [rotatedLip] = rotatePoints([lip], angle);
    return polygonArea(clipBelow(rotated, rotatedLip.y));
  }

  function angleForVolume(volume) {
    return bisect(0, MAX_POUR_ANGLE, (angle) => capacityAtAngle(angle) > volume, 28);
  }

  return { lip, fullVolume, capacityAtAngle, angleForVolume };
}
