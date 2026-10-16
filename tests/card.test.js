const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');

const settle = () => new Promise(resolve => setImmediate(resolve));
function card({ snapshot = null } = {}) {
  let requests = 0, reads = 0, finish, saved = snapshot;
  const drawn = [];
  const listeners = {}, timers = new Map();
  let timerId = 0, pull;
  const repository = {
    async getProfile() { reads++; return { name: '缓存玩家', publicUpdatedAt: 0 }; },
    async getImages() { return {}; },
    refreshPublic() { requests++; return new Promise(resolve => { finish = resolve; }); }
  };
  const window = {
    MaiProfile: { createRepository: () => repository },
    MaiRenderer: { create: () => ({ setProfile(profile, images) { drawn.push({ profile, images }); }, setRefreshState() {}, dispose() {}, size: { width: 912, height: 596 } }) },
    MaiPullRefresh: { attach: (canvas, options) => { pull = options; return () => {}; } },
    setInterval(fn) { timers.set(++timerId, fn); return timerId; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  };
  const context = { window, module: { exports: {} } };
  vm.runInNewContext(readFileSync('src/card.js', 'utf8'), context);
  const instance = context.module.exports.start({}, {
    card: {
      onRefresh(fn) { listeners.refresh = fn; },
      readSnapshot() { return saved; },
      saveSnapshot(value) { saved = value; }
    },
    config: { onChange(fn) { listeners.config = fn; } }
  });
  return { instance, listeners, timers, drawn, pull, get saved() { return saved; },
    get requests() { return requests; }, get reads() { return reads; },
    complete: () => finish() };
}

test('refresh notifications reread cached data without requesting the public or paid API', async () => {
  const c = card();
  await settle();
  const reads = c.reads;
  c.listeners.refresh();
  await settle();
  assert.ok(c.reads > reads);
  assert.equal(c.requests, 0);
  c.instance.dispose();
  assert.equal(c.timers.size, 0);
});

test('startup and config changes only load cache, without scheduling automatic requests', async () => {
  const c = card();
  await settle();
  assert.equal(c.requests, 0);
  assert.equal(c.timers.size, 0);
  const reads = c.reads;
  c.listeners.config();
  await settle();
  assert.ok(c.reads > reads);
  assert.equal(c.requests, 0);
  assert.equal(c.timers.size, 0);
  c.instance.dispose();
});

test('manual pull refreshes public data and blocks duplicate in-flight requests', async () => {
  const c = card();
  await settle();
  const reads = c.reads;
  const pending = c.pull.onRefresh();
  assert.equal(c.requests, 1);
  assert.equal(c.pull.canRefresh(), false);
  await c.pull.onRefresh();
  assert.equal(c.requests, 1);
  c.complete();
  await pending;
  assert.ok(c.reads > reads);
  assert.equal(c.pull.canRefresh(), true);
  c.instance.dispose();
  assert.equal(c.timers.size, 0);
});

test('startup draws the saved snapshot synchronously and saves the loaded profile', async () => {
  const c = card({ snapshot: { profile: { name: '快照玩家' }, images: { icon: 'data:image/png;base64,AA' } } });
  assert.equal(c.drawn[0].profile.name, '快照玩家');
  assert.equal(c.drawn[0].images.icon, 'data:image/png;base64,AA');
  await settle();
  assert.equal(c.saved.profile.name, '缓存玩家');
  c.instance.dispose();
});
