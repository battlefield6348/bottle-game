import { CAPACITY } from './rules.js';
import { makeBottleShape, makePourProfile, levelForVolume } from './geometry.js';
import { COLORS, HIDDEN_FILL } from './palette.js';
import { clamp01, progress, easeOutBounce, easeOutCubic } from './easing.js';

const HEADROOM_RATIO = 0.13;
export const RENDER_TIMING = { reveal: 420, seal: 560, unlock: 560, hint: 1600, shake: 380 };

export function makeMetrics(width, height) {
  const shape = makeBottleShape(width, height, 28);
  const profile = makePourProfile(shape, height * HEADROOM_RATIO);
  return {
    width,
    height,
    halfWidth: width / 2,
    shape,
    profile,
    unitVolume: profile.fullVolume / CAPACITY,
    uprightLevels: new Map(),
  };
}

// pose：(x, y) 是瓶口支點 (dir * halfWidth, 0) 在世界座標的位置，angle 以支點旋轉。
function applyLocalTransform(ctx, pose, metrics) {
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.translate(-pose.dir * metrics.halfWidth, 0);
}

function localToWorld(point, pose, metrics) {
  const x = point.x - pose.dir * metrics.halfWidth;
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return { x: pose.x + x * cos - point.y * sin, y: pose.y + x * sin + point.y * cos };
}

// 回傳「液量（單位數）→ 世界座標液面 y」的函式；直立時查快取避免每幀重算。
export function levelResolver(pose, metrics) {
  if (pose.angle === 0) {
    return (units) => {
      const key = Math.round(units * 1000);
      let level = metrics.uprightLevels.get(key);
      if (level === undefined) {
        level = levelForVolume(metrics.shape, units * metrics.unitVolume);
        metrics.uprightLevels.set(key, level);
      }
      return pose.y + level;
    };
  }
  const worldShape = metrics.shape.map((point) => localToWorld(point, pose, metrics));
  return (units) => levelForVolume(worldShape, units * metrics.unitVolume);
}

function traceShape(ctx, shape) {
  ctx.beginPath();
  ctx.moveTo(shape[0].x, shape[0].y);
  for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i].x, shape[i].y);
  ctx.closePath();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

// 液面高度在旋轉後的瓶身中，找出瓶身中心軸與該高度的交點作為「?」的位置。
function axisPointAtY(pose, metrics, worldY) {
  const top = localToWorld({ x: 0, y: 0 }, pose, metrics);
  const bottom = localToWorld({ x: 0, y: metrics.height }, pose, metrics);
  const span = bottom.y - top.y;
  const t = Math.abs(span) < 1e-6 ? 0.5 : clamp01((worldY - top.y) / span);
  return { x: top.x + (bottom.x - top.x) * t, y: worldY };
}

function drawLiquid(ctx, view, metrics, now, dpr) {
  const { pose } = view;
  const levelAt = levelResolver(pose, metrics);
  const reach = metrics.height * 2;
  const reveal = view.reveal;
  const revealT = reveal ? progress(now, reveal.start, RENDER_TIMING.reveal) : 1;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let below = 0;
  for (const segment of view.segments) {
    if (segment.amount <= 0.001) continue;
    const lowerY = levelAt(below);
    const upperY = levelAt(below + segment.amount);
    ctx.fillStyle = segment.hidden ? HIDDEN_FILL : COLORS[segment.color].fill;
    // 往下多畫一點像素，避免相鄰色帶之間出現細縫。
    ctx.fillRect(pose.x - reach, upperY, reach * 2, lowerY - upperY + 0.8);

    const isRevealing = reveal && revealT < 1 && below >= reveal.from - 1e-6 && below < reveal.to;
    if (segment.hidden || isRevealing) {
      const alpha = segment.hidden ? 1 : 1 - revealT;
      const unitCount = Math.round(segment.amount);
      for (let unit = 0; unit < unitCount; unit++) {
        const unitLower = levelAt(below + unit);
        const unitUpper = levelAt(below + unit + 1);
        if (isRevealing) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = HIDDEN_FILL;
          ctx.fillRect(pose.x - reach, unitUpper, reach * 2, unitLower - unitUpper);
        }
        const center = axisPointAtY(pose, metrics, (unitLower + unitUpper) / 2);
        const scale = isRevealing ? 1 + revealT * 0.8 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `800 ${metrics.width * 0.42 * scale}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', center.x, center.y + 1);
        ctx.globalAlpha = 1;
        if (unit > 0 || below > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(pose.x - reach, unitLower - 0.5, reach * 2, 1);
        }
      }
    }
    below += segment.amount;
  }

  if (below > 0.001) {
    const surfaceY = levelAt(below);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(pose.x - reach, surfaceY, reach * 2, Math.max(1.5, metrics.width * 0.035));
  }
  ctx.restore();
}

function drawGlassShading(ctx, metrics) {
  const { halfWidth, height } = metrics;
  const shading = ctx.createLinearGradient(-halfWidth, 0, halfWidth, 0);
  shading.addColorStop(0, 'rgba(255,255,255,0.20)');
  shading.addColorStop(0.28, 'rgba(255,255,255,0.02)');
  shading.addColorStop(0.7, 'rgba(0,0,0,0.04)');
  shading.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = shading;
  ctx.fillRect(-halfWidth, 0, halfWidth * 2, height);
}

function drawGlassFrame(ctx, view, metrics, now) {
  const { width, halfWidth, height, shape } = metrics;
  const bound = view.bottle.bound;
  const lineWidth = Math.max(2, width * 0.06);

  if (view.hintStart !== null && now - view.hintStart < RENDER_TIMING.hint) {
    const pulse = 0.5 + 0.5 * Math.sin(((now - view.hintStart) / 220) * Math.PI);
    ctx.save();
    ctx.shadowColor = '#ffe066';
    ctx.shadowBlur = 18 * pulse + 6;
    ctx.strokeStyle = `rgba(255,224,102,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = lineWidth + 3;
    traceShape(ctx, shape);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = bound !== null ? COLORS[bound].fill : 'rgba(235,242,255,0.78)';
  ctx.lineWidth = bound !== null ? lineWidth * 1.4 : lineWidth;
  ctx.lineJoin = 'round';
  traceShape(ctx, shape);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundedRect(ctx, -halfWidth * 0.66, height * 0.12, width * 0.11, height * 0.56, width * 0.06);
  ctx.fill();

  ctx.fillStyle = bound !== null ? COLORS[bound].fill : 'rgba(235,242,255,0.9)';
  roundedRect(ctx, -halfWidth - width * 0.1, -lineWidth * 1.3, width * 1.2, lineWidth * 2.2, lineWidth);
  ctx.fill();
}

function drawBoundTag(ctx, view, metrics) {
  const bound = view.bottle.bound;
  if (bound === null) return;
  const { width, height } = metrics;
  const y = height + height * 0.12;
  ctx.fillStyle = COLORS[bound].fill;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, y, width * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-width * 0.12, y - width * 0.34);
  ctx.lineTo(0, y - width * 0.25);
  ctx.lineTo(width * 0.12, y - width * 0.34);
  ctx.strokeStyle = COLORS[bound].fill;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function lockFade(view, now) {
  if (view.lockedShown) return { alpha: 1, burst: 0 };
  if (view.unlockStart === null) return null;
  const t = progress(now, view.unlockStart, RENDER_TIMING.unlock);
  if (t >= 1) return null;
  return { alpha: 1 - easeOutCubic(t), burst: easeOutCubic(t) };
}

function drawChain(ctx, view, metrics, fade) {
  const { width, halfWidth, height } = metrics;
  const linkLength = width * 0.34;
  const lines = [
    [{ x: -halfWidth * 1.3, y: height * 0.22 }, { x: halfWidth * 1.3, y: height * 0.74 }],
    [{ x: halfWidth * 1.3, y: height * 0.22 }, { x: -halfWidth * 1.3, y: height * 0.74 }],
  ];
  ctx.save();
  ctx.globalAlpha = fade.alpha;
  for (const [start, end] of lines) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const links = Math.floor(length / (linkLength * 0.78));
    for (let i = 0; i <= links; i++) {
      const t = i / links;
      const spread = (t - 0.5) * fade.burst * width * 1.6;
      const x = start.x + (end.x - start.x) * t + Math.cos(angle) * spread;
      const y = start.y + (end.y - start.y) * t + Math.sin(angle) * spread + fade.burst * fade.burst * height * 0.3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#59627a';
      ctx.lineWidth = Math.max(3, width * 0.1);
      ctx.beginPath();
      if (i % 2 === 0) ctx.ellipse(0, 0, linkLength * 0.5, linkLength * 0.26, 0, 0, Math.PI * 2);
      else ctx.ellipse(0, 0, linkLength * 0.5, 1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#d7deea';
      ctx.lineWidth = Math.max(1.5, width * 0.05);
      ctx.stroke();
      ctx.restore();
    }
  }

  const lockY = height * 0.48 + fade.burst * height * 0.2;
  ctx.translate(0, lockY);
  ctx.scale(1 + fade.burst * 0.3, 1 + fade.burst * 0.3);
  ctx.strokeStyle = '#cfd6e2';
  ctx.lineWidth = Math.max(3, width * 0.09);
  ctx.beginPath();
  ctx.arc(0, -width * 0.12, width * 0.19, Math.PI, 0);
  ctx.stroke();
  const body = ctx.createLinearGradient(0, -width * 0.12, 0, width * 0.36);
  body.addColorStop(0, '#ffd166');
  body.addColorStop(1, '#e09a1a');
  ctx.fillStyle = body;
  roundedRect(ctx, -width * 0.32, -width * 0.12, width * 0.64, width * 0.48, width * 0.1);
  ctx.fill();
  ctx.fillStyle = COLORS[view.bottle.chain].fill;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, width * 0.12, width * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawIce(ctx, view, metrics, fade, remaining) {
  const { width, halfWidth, height, shape } = metrics;
  ctx.save();
  ctx.globalAlpha = fade.alpha;
  ctx.save();
  traceShape(ctx, shape);
  ctx.clip();
  const meltOffset = fade.burst * height * 0.5;
  const frost = ctx.createLinearGradient(0, 0, 0, height);
  frost.addColorStop(0, 'rgba(224,245,255,0.92)');
  frost.addColorStop(1, 'rgba(150,210,245,0.82)');
  ctx.fillStyle = frost;
  ctx.fillRect(-halfWidth, meltOffset, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-halfWidth, height * 0.3 + meltOffset);
  ctx.lineTo(-halfWidth * 0.2, height * 0.42 + meltOffset);
  ctx.lineTo(halfWidth * 0.3, height * 0.36 + meltOffset);
  ctx.lineTo(halfWidth, height * 0.5 + meltOffset);
  ctx.moveTo(-halfWidth * 0.2, height * 0.42 + meltOffset);
  ctx.lineTo(-halfWidth * 0.4, height * 0.7 + meltOffset);
  ctx.lineTo(halfWidth * 0.2, height * 0.86 + meltOffset);
  ctx.stroke();
  ctx.restore();

  if (remaining > 0) {
    const badgeY = height * 0.18 + meltOffset;
    ctx.fillStyle = '#2d7fd6';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, badgeY, width * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${width * 0.32}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(remaining), 0, badgeY + 1);
  }
  ctx.restore();
}

function drawCap(ctx, view, metrics, now) {
  if (view.sealStart === null) return;
  const { width, halfWidth, height } = metrics;
  const t = progress(now, view.sealStart, RENDER_TIMING.seal);
  const drop = (1 - easeOutBounce(t)) * height * 0.4;
  const capHeight = height * 0.075;
  const color = COLORS[view.bottle.layers[0]].fill;

  ctx.save();
  ctx.globalAlpha = clamp01(t * 4);
  ctx.translate(0, -drop);
  const gradient = ctx.createLinearGradient(0, -capHeight, 0, capHeight * 0.4);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = color;
  roundedRect(ctx, -halfWidth - width * 0.14, -capHeight, width * 1.28, capHeight * 1.35, capHeight * 0.4);
  ctx.fill();
  ctx.fillStyle = gradient;
  ctx.globalAlpha *= 0.55;
  ctx.fill();
  ctx.restore();

  if (t < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    traceShape(ctx, metrics.shape);
    ctx.stroke();
    ctx.restore();
  }
}

function drawShadow(ctx, view, metrics) {
  const { width, height } = metrics;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(view.slot.x, view.slot.y + height + height * 0.025, width * 0.62, width * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBottle(ctx, view, metrics, scene) {
  const { now, dpr } = scene;
  ctx.save();
  ctx.globalAlpha = view.alpha;
  applyLocalTransform(ctx, view.pose, metrics);

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  traceShape(ctx, metrics.shape);
  ctx.fill();

  ctx.save();
  traceShape(ctx, metrics.shape);
  ctx.clip();
  drawLiquid(ctx, view, metrics, now, dpr);
  drawGlassShading(ctx, metrics);
  ctx.restore();

  drawGlassFrame(ctx, view, metrics, now);
  drawBoundTag(ctx, view, metrics);

  const fade = lockFade(view, now);
  if (fade && view.bottle.chain !== null) drawChain(ctx, view, metrics, fade);
  if (fade && view.bottle.ice > 0) {
    drawIce(ctx, view, metrics, fade, Math.max(view.bottle.ice - scene.completedCount, 0));
  }
  drawCap(ctx, view, metrics, now);
  ctx.restore();
}

function drawStream(ctx, stream, metrics) {
  if (stream.bottomY - stream.topY < 0.5) return;
  const topHalf = metrics.width * 0.085;
  const bottomHalf = metrics.width * 0.065;
  ctx.fillStyle = COLORS[stream.color].fill;
  ctx.beginPath();
  ctx.moveTo(stream.x - topHalf, stream.topY);
  ctx.lineTo(stream.x + topHalf, stream.topY);
  ctx.lineTo(stream.x + bottomHalf, stream.bottomY);
  ctx.lineTo(stream.x - bottomHalf, stream.bottomY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(stream.x - topHalf * 0.45, stream.topY, topHalf * 0.3, stream.bottomY - stream.topY);
}

function drawParticles(ctx, particles, now) {
  for (const particle of particles) {
    const t = (now - particle.born) / 1000;
    const life = 1 - (now - particle.born) / particle.life;
    if (life <= 0) continue;
    const x = particle.x + particle.vx * t;
    const y = particle.y + particle.vy * t + 0.5 * particle.gravity * t * t;
    ctx.globalAlpha = clamp01(life * 1.5);
    ctx.fillStyle = particle.color;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(particle.spin * t);
    ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawLabels(ctx, views, metrics, labels) {
  const { width, height } = metrics;
  const radius = width * 0.24;
  ctx.font = `800 ${width * 0.28}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const view of views) {
    const x = view.slot.x;
    const y = view.slot.y + height + height * 0.025 + radius * 1.5;
    const active = labels.active?.includes(view.index);
    ctx.fillStyle = active ? '#ffcf4a' : 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = active ? '#3a2a00' : 'rgba(255,255,255,0.85)';
    ctx.fillText(String(view.index + 1), x, y + 1);
  }
}

export function drawScene(ctx, scene) {
  const { metrics, views, streams, particles, dpr, width, height } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (!metrics) return;

  for (const view of views) drawShadow(ctx, view, metrics);
  if (scene.labels) drawLabels(ctx, views, metrics, scene.labels);
  const resting = views.filter((view) => !view.pouring);
  const pouring = views.filter((view) => view.pouring).sort((a, b) => a.z - b.z);
  for (const view of resting) drawBottle(ctx, view, metrics, scene);
  for (const stream of streams) drawStream(ctx, stream, metrics);
  for (const view of pouring) drawBottle(ctx, view, metrics, scene);
  drawParticles(ctx, particles, scene.now);
}
