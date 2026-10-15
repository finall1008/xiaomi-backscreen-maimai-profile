const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('initial data, image completion and status only draw inside RAF; disposal stops old images', () => {
  let next = 0, paints = 0;
  const frames = new Map(), images = [];
  const window = {
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { frames.delete(id); },
    Image: class { constructor() { images.push(this); this.width = 350; this.height = 69; } }
  };
  const ctx = new Proxy({ measureText: text => ({ width: text.length * 15 }) }, {
    get(target, name) { return name in target ? target[name] : () => { paints++; }; }
  });
  vm.runInNewContext(readFileSync('src/shared/render.js', 'utf8'), { window });
  const renderer = window.MaiRenderer.create({ width: 912, height: 596, getContext: () => ctx });
  renderer.setProfile({ name: '玩家', rating: 15100 }, {});
  renderer.setRefreshState({ message: '刷新完成' });
  assert.equal(paints, 0);
  assert.equal(frames.size, 1);
  const [id, draw] = frames.entries().next().value;
  frames.delete(id); draw();
  assert.ok(paints > 0); // Text can draw before any image has loaded.
  const beforeImage = paints;
  images[0].onload();
  assert.equal(paints, beforeImage);
  assert.equal(frames.size, 1);
  const oldCallback = images[0].onload;
  renderer.dispose();
  oldCallback();
  assert.equal(frames.size, 0);
  assert.equal(paints, beforeImage);
});

test('rating tier matches existing thresholds', () => {
  const window = {};
  vm.runInNewContext(readFileSync('src/shared/render.js', 'utf8'), { window });
  assert.equal(window.MaiRenderer.ratingTier(0), 1);
  assert.equal(window.MaiRenderer.ratingTier(14500), 10);
  assert.equal(window.MaiRenderer.ratingTier(15000), 11);
});
