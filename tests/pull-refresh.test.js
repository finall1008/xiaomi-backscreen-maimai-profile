const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function gesture() {
  const handlers = {}, frames = new Map();
  let next = 0, calls = 0, busy = false, pull = 0;
  const window = {
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { frames.delete(id); }
  };
  vm.runInNewContext(readFileSync('src/shared/pull-refresh.js', 'utf8'), { window });
  const canvas = {
    addEventListener(name, fn) { handlers[name] = fn; },
    removeEventListener(name) { delete handlers[name]; },
    getBoundingClientRect() { return { left: 10, top: 20, width: 456, height: 298 }; }
  };
  const dispose = window.MaiPullRefresh.attach(canvas, {
    canRefresh: () => !busy,
    onRefresh() { calls++; busy = true; },
    onPull(value) { pull = value; }
  });
  function event(name, x, y, extra = {}) {
    handlers[name]?.({ pointerId: 1, isPrimary: true, button: 0,
      clientX: 10 + x / 2, clientY: 20 + y / 2, ...extra });
  }
  return { event, dispose, get calls() { return calls; }, get pull() { return pull; }, handlers, frames };
}

test('scaled canvas: release past threshold refreshes once; busy does not retrigger', () => {
  const g = gesture();
  g.event('pointerdown', 600, 150);
  g.event('pointermove', 600, 300);
  assert.equal(g.pull, 75);
  g.event('pointerup', 600, 300);
  g.event('pointerup', 600, 300);
  g.event('pointerdown', 600, 150);
  g.event('pointerup', 600, 320);
  assert.equal(g.calls, 1);
});

test('short pull, horizontal swipe, and camera area never refresh', () => {
  for (const [x, dx, dy] of [[600, 0, 80], [600, 150, 180], [100, 0, 180]]) {
    const g = gesture();
    g.event('pointerdown', x, 100);
    if (dx) g.event('pointermove', x + dx, 110); // Lock horizontal before downward motion.
    g.event('pointermove', x + dx, 100 + dy);
    g.event('pointerup', x + dx, 100 + dy);
    assert.equal(g.calls, 0);
  }
});

test('pointer cancellation and second finger do not execute a pending pull', () => {
  const g = gesture();
  g.event('pointerdown', 600, 100);
  g.event('pointermove', 600, 280, { pointerId: 2 });
  assert.equal(g.pull, 0);
  g.event('pointermove', 600, 280);
  g.event('pointercancel', 600, 280);
  g.event('pointerup', 600, 280);
  assert.equal(g.calls, 0);
  g.dispose();
  assert.equal(Object.keys(g.handlers).length, 0);
  assert.equal(g.frames.size, 0);
});
