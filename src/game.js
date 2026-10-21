import { canPour, pour, isComplete, isLocked, isWon, completedColors } from './rules.js';
import { layoutBottles } from './layout.js';
import { makeMetrics, drawScene, levelResolver, RENDER_TIMING } from './renderer.js';
import { COLORS } from './palette.js';
import {
  clamp01,
  lerp,
  progress,
  easeInOutCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
} from './easing.js';

const TIMING = {
  lift: 190,
  move: 420,
  flowBase: 260,
  flowPerUnit: 170,
  fall: 120,
  return: 400,
  intro: 560,
  introStagger: 45,
};
const LIFT_RATIO = 0.16;
const HUD_HEIGHT = 72;
// 水量接近 0 時傾倒角會趨近極限，保留一點避免角度在倒完瞬間跳動。
const MIN_POUR_UNITS = 0.04;

function segmentsFor(bottle) {
  const segments = [];
  bottle.layers.forEach((color, index) => {
    const hidden = index < bottle.hidden;
    const last = segments[segments.length - 1];
    if (last && !hidden && !last.hidden && last.color === color) last.amount += 1;
    else segments.push({ color, amount: 1, hidden });
  });
  return segments;
}

export class Game {
  constructor(canvas, { onWin, onMessage, onMove }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onWin = onWin;
    this.onMessage = onMessage;
    this.onMove = onMove;
    this.views = [];
    this.pours = [];
    this.particles = [];
    this.history = [];
    this.bottles = [];
    this.selected = null;
    this.metrics = null;
    this.zCounter = 0;
    this.won = false;
    // 自動通關時在瓶下顯示編號；active 為目前步驟的來源與目標瓶。
    this.labels = null;
  }

  load(levelData, now) {
    this.levelData = levelData;
    this.bottles = levelData.bottles;
    this.history = [];
    this.pours = [];
    this.particles = [];
    this.selected = null;
    this.won = false;
    this.views = this.bottles.map((bottle, index) => ({
      index,
      bottle,
      slot: { x: 0, y: 0 },
      pose: { x: 0, y: 0, angle: 0, dir: 1 },
      segments: segmentsFor(bottle),
      liftFrom: 0,
      liftTo: 0,
      liftStart: -Infinity,
      pouring: false,
      busy: false,
      lockedShown: isLocked(bottle, this.bottles),
      unlockStart: null,
      sealStart: null,
      reveal: null,
      shakeStart: null,
      hintStart: null,
      introStart: now + index * TIMING.introStagger,
      alpha: 1,
      z: 0,
    }));
    this.layout();
    this.onMove?.(this.history.length);
  }

  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.layout();
  }

  layout() {
    if (!this.width || this.views.length === 0) return;
    const { bottleWidth, bottleHeight, slots } = layoutBottles(this.views.length, {
      width: this.width,
      height: this.height,
      top: HUD_HEIGHT,
    });
    this.metrics = makeMetrics(bottleWidth, bottleHeight);
    this.views.forEach((view, index) => {
      view.slot = slots[index];
    });
  }

  get isAnimating() {
    return this.pours.length > 0;
  }

  currentLift(view, now) {
    const t = progress(now, view.liftStart, TIMING.lift);
    const eased = view.liftTo > view.liftFrom ? easeOutBack(t) : easeOutCubic(t);
    return lerp(view.liftFrom, view.liftTo, eased);
  }

  setLift(view, target, now) {
    view.liftFrom = this.currentLift(view, now);
    view.liftTo = target;
    view.liftStart = now;
  }

  restPose(view, now, dir = view.pose.dir) {
    const { halfWidth, height } = this.metrics;
    const introT = progress(now, view.introStart, TIMING.intro);
    const introOffset = (1 - easeOutBack(introT)) * -height * 0.6;
    let shake = 0;
    if (view.shakeStart !== null) {
      const t = progress(now, view.shakeStart, RENDER_TIMING.shake);
      shake = Math.sin(t * Math.PI * 6) * (1 - t) * halfWidth * 0.35;
    }
    return {
      x: view.slot.x + dir * halfWidth + shake,
      y: view.slot.y - this.currentLift(view, now) * height * LIFT_RATIO + introOffset,
      angle: 0,
      dir,
    };
  }

  isSelectable(index) {
    const view = this.views[index];
    const bottle = this.bottles[index];
    if (view.busy || view.lockedShown) return false;
    return bottle.layers.length > 0 && !isComplete(bottle);
  }

  hitTest(x, y) {
    if (!this.metrics) return null;
    const { width, height } = this.metrics;
    const padding = width * 0.3;
    let bestIndex = null;
    let bestDistance = Infinity;
    this.views.forEach((view, index) => {
      const insideX = Math.abs(x - view.slot.x) <= width / 2 + padding;
      const insideY = y >= view.slot.y - height * LIFT_RATIO - padding && y <= view.slot.y + height * 1.3;
      if (!insideX || !insideY) return;
      const distance = Math.abs(x - view.slot.x);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  explainLock(index) {
    const bottle = this.bottles[index];
    if (bottle.chain !== null && !completedColors(this.bottles).has(bottle.chain)) {
      this.onMessage?.(`鎖鏈瓶：先完成「${COLORS[bottle.chain].name}」色才能解鎖`);
      return;
    }
    const remaining = bottle.ice - completedColors(this.bottles).size;
    this.onMessage?.(`冰凍瓶：再完成 ${remaining} 種顏色即可解凍`);
  }

  tap(x, y, now) {
    if (this.won) return;
    const index = this.hitTest(x, y);
    if (index === null) {
      this.deselect(now);
      return;
    }

    if (this.selected === null) {
      if (this.isSelectable(index)) {
        this.selected = index;
        this.setLift(this.views[index], 1, now);
        return;
      }
      this.views[index].shakeStart = now;
      if (this.views[index].lockedShown) this.explainLock(index);
      return;
    }

    if (this.selected === index) {
      this.deselect(now);
      return;
    }

    const from = this.selected;
    const target = this.views[index];
    const targetReady = !target.busy && !target.lockedShown;
    if (targetReady && canPour(this.bottles, from, index)) {
      this.startPour(from, index, now);
      return;
    }

    this.deselect(now);
    if (this.isSelectable(index)) {
      this.selected = index;
      this.setLift(target, 1, now);
      return;
    }
    target.shakeStart = now;
    if (target.lockedShown) this.explainLock(index);
  }

  // 自動通關用：直接執行一步倒水，盤面狀態不允許時回傳 false。
  autoPour(from, to, now) {
    if (this.won || this.views[from].busy || this.views[to].busy) return false;
    if (!canPour(this.bottles, from, to)) return false;
    this.deselect(now);
    this.startPour(from, to, now);
    return true;
  }

  deselect(now) {
    if (this.selected === null) return;
    this.setLift(this.views[this.selected], 0, now);
    this.selected = null;
  }

  startPour(from, to, now) {
    const result = pour(this.bottles, from, to);
    const before = this.bottles;
    this.history.push(before);
    this.bottles = result.bottles;
    this.views.forEach((view, index) => {
      view.bottle = this.bottles[index];
    });
    this.selected = null;

    const source = this.views[from];
    const target = this.views[to];
    const { halfWidth, height, profile, unitVolume } = this.metrics;
    let dir = Math.sign(target.slot.x - source.slot.x);
    if (dir === 0) dir = target.slot.x < this.width / 2 ? -1 : 1;

    const startPose = this.restPose(source, now, dir);
    source.liftFrom = 0;
    source.liftTo = 0;
    source.pouring = true;
    source.busy = true;
    source.z = ++this.zCounter;
    target.busy = true;

    const sourceUnits = before[from].layers.length;
    const targetUnits = before[to].layers.length;
    const sourceSegment = source.segments[source.segments.length - 1];
    const targetSegment = { color: result.color, amount: 0, hidden: false };
    target.segments.push(targetSegment);

    this.pours.push({
      from,
      to,
      dir,
      start: now,
      amount: result.amount,
      color: result.color,
      sourceUnits,
      targetUnits,
      sourceHiddenBefore: before[from].hidden,
      sourceSegment,
      sourceSegmentAmount: sourceSegment.amount,
      targetSegment,
      startPose,
      pourPose: {
        x: target.slot.x - dir * halfWidth * 0.3,
        y: target.slot.y - height * 0.17,
        dir,
      },
      startAngle: dir * profile.angleForVolume(sourceUnits * unitVolume),
      endAngle: dir * profile.angleForVolume(Math.max(sourceUnits - result.amount, MIN_POUR_UNITS) * unitVolume),
      flowDuration: TIMING.flowBase + TIMING.flowPerUnit * result.amount,
      sourceSettled: false,
      stream: null,
    });
    this.onMove?.(this.history.length);
  }

  updatePour(job, now) {
    const source = this.views[job.from];
    const target = this.views[job.to];
    const { profile, unitVolume } = this.metrics;
    const elapsed = now - job.start;
    const flowStart = TIMING.move;
    const flowEnd = flowStart + job.flowDuration;

    if (elapsed < flowStart) {
      const t = elapsed / flowStart;
      const travel = easeInOutCubic(t);
      const arc = Math.sin(travel * Math.PI) * this.metrics.height * 0.08;
      source.pose = {
        x: lerp(job.startPose.x, job.pourPose.x, travel),
        y: lerp(job.startPose.y, job.pourPose.y, travel) - arc,
        angle: job.startAngle * easeInOutSine(t),
        dir: job.dir,
      };
    } else if (elapsed < flowEnd) {
      const flowed = easeInOutSine((elapsed - flowStart) / job.flowDuration);
      const remainingUnits = job.sourceUnits - job.amount * flowed;
      job.sourceSegment.amount = job.sourceSegmentAmount - job.amount * flowed;
      // 角度由剩餘水量反推：液面恰好貼齊瓶口，倒水過程才會連續且不溢出。
      const angle = profile.angleForVolume(Math.max(remainingUnits, MIN_POUR_UNITS) * unitVolume);
      source.pose = { ...job.pourPose, angle: job.dir * angle };
    } else {
      if (!job.sourceSettled) this.settleSource(job, now);
      const back = easeInOutCubic(clamp01((elapsed - flowEnd) / TIMING.return));
      const rest = this.restPose(source, now, job.dir);
      source.pose = {
        x: lerp(job.pourPose.x, rest.x, back),
        y: lerp(job.pourPose.y, rest.y, back),
        angle: lerp(job.endAngle, 0, back),
        dir: job.dir,
      };
    }

    const filled = easeInOutSine(clamp01((elapsed - flowStart - TIMING.fall) / job.flowDuration));
    job.targetSegment.amount = job.amount * filled;

    const streamVisible = elapsed >= flowStart && elapsed <= flowEnd + TIMING.fall;
    if (streamVisible) {
      const targetPose = this.restPose(target, now, 1);
      const surfaceY = levelResolver(targetPose, this.metrics)(job.targetUnits + job.amount * filled);
      const drop = surfaceY - job.pourPose.y;
      const head = clamp01((elapsed - flowStart) / TIMING.fall);
      const tail = clamp01((elapsed - flowEnd) / TIMING.fall);
      job.stream = {
        x: job.pourPose.x,
        topY: job.pourPose.y + drop * tail * tail,
        bottomY: job.pourPose.y + drop * head,
        color: job.color,
      };
      if (filled > 0 && Math.random() < 0.35) this.splash(job.pourPose.x, surfaceY, job.color, now, 1);
    } else {
      job.stream = null;
    }

    const done = elapsed >= flowEnd + TIMING.return && filled >= 1;
    if (done) this.finishPour(job, now);
    return done;
  }

  settleSource(job, now) {
    job.sourceSettled = true;
    const source = this.views[job.from];
    const bottle = this.bottles[job.from];
    source.segments = segmentsFor(bottle);
    if (bottle.hidden < job.sourceHiddenBefore && bottle.layers.length > 0) {
      source.reveal = {
        from: bottle.hidden,
        to: Math.min(job.sourceHiddenBefore, bottle.layers.length),
        start: now,
      };
    }
  }

  finishPour(job, now) {
    const source = this.views[job.from];
    const target = this.views[job.to];
    source.pouring = false;
    source.busy = false;
    source.pose = this.restPose(source, now);
    target.busy = false;
    target.segments = segmentsFor(this.bottles[job.to]);

    if (isComplete(this.bottles[job.to])) {
      target.sealStart = now;
      const { x, y } = target.slot;
      for (let i = 0; i < 22; i++) this.confetti(x, y, COLORS[job.color].fill, now);
    }
  }

  refreshLocks(now) {
    this.views.forEach((view, index) => {
      if (!view.lockedShown || isLocked(this.bottles[index], this.bottles)) return;
      view.lockedShown = false;
      view.unlockStart = now;
      const { x, y } = view.slot;
      for (let i = 0; i < 16; i++) {
        this.confetti(x, y + this.metrics.height * 0.5, view.bottle.chain !== null ? '#d7deea' : '#bfe8ff', now);
      }
    });
  }

  splash(x, y, color, now, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * this.metrics.width * 0.2,
        y,
        vx: (Math.random() - 0.5) * 60,
        vy: -40 - Math.random() * 60,
        gravity: 600,
        size: 2 + Math.random() * 2.5,
        spin: 0,
        born: now,
        life: 320,
        color: COLORS[color].fill,
      });
    }
  }

  confetti(x, y, color, now) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 160 + Math.random() * 220;
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 520,
      size: 5 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 16,
      born: now,
      life: 900 + Math.random() * 500,
      color,
    });
  }

  celebrate(now) {
    for (let i = 0; i < 140; i++) {
      const color = COLORS[i % COLORS.length].fill;
      this.particles.push({
        x: Math.random() * this.width,
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 120,
        vy: 80 + Math.random() * 160,
        gravity: 260,
        size: 6 + Math.random() * 6,
        spin: (Math.random() - 0.5) * 14,
        born: now + Math.random() * 400,
        life: 2400,
        color,
      });
    }
  }

  undo(now) {
    if (this.isAnimating || this.history.length === 0 || this.won) return;
    this.deselect(now);
    this.bottles = this.history.pop();
    this.views.forEach((view, index) => {
      const bottle = this.bottles[index];
      view.bottle = bottle;
      view.segments = segmentsFor(bottle);
      view.reveal = null;
      view.lockedShown = isLocked(bottle, this.bottles);
      view.unlockStart = null;
      view.sealStart = isComplete(bottle) ? -Infinity : null;
    });
    this.onMove?.(this.history.length);
  }

  showHint(move, now) {
    if (!move) return;
    this.deselect(now);
    this.views[move[0]].hintStart = now;
    this.views[move[1]].hintStart = now;
  }

  frame(now) {
    const before = this.pours.length;
    this.pours = this.pours.filter((job) => !this.updatePour(job, now));
    const finishedSome = this.pours.length < before;

    for (const view of this.views) {
      if (view.pouring) continue;
      view.pose = this.restPose(view, now);
      view.alpha = clamp01(progress(now, view.introStart, TIMING.intro) * 2.5);
    }

    // 解鎖要等所有倒水動畫結束，畫面上看到顏色完成後才發生。
    if (finishedSome && this.pours.length === 0) {
      this.refreshLocks(now);
      if (isWon(this.bottles) && !this.won) {
        this.won = true;
        this.celebrate(now);
        this.onWin?.(this.history.length);
      }
    }

    this.particles = this.particles.filter((particle) => now - particle.born < particle.life);
    drawScene(this.ctx, {
      metrics: this.metrics,
      views: this.views,
      streams: this.pours.map((job) => job.stream).filter(Boolean),
      particles: this.particles.filter((particle) => now >= particle.born),
      completedCount: completedColors(this.bottles).size,
      labels: this.labels,
      now,
      dpr: this.dpr,
      width: this.width,
      height: this.height,
    });
  }
}
