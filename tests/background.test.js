const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const MaiProfile = require('../src/shared/profile.js');

function background({ qq = '123', response, saveSnapshot } = {}) {
  const calls = [], snapshots = [];
  let profile = { account: qq, name: '缓存玩家', rating: 14000, iconId: 7, title: '称号', fullUpdatedAt: 100 };
  const bridge = {
    config: { async get() { return { publicQq: qq, autoRefresh: false, refreshIntervalMinutes: 120 }; } },
    storage: {
      async get(key) { assert.equal(key, 'profile', '后台不得读取网关令牌'); return profile; },
      async set(key, value) { assert.equal(key, 'profile'); profile = value; }
    },
    files: { async readText(path) { assert.equal(path, 'cache/images/icon-7.txt'); return 'data:image/png;base64,AA'; } },
    net: { async request(request) {
      calls.push(request);
      assert.equal(request.url, 'https://net.wmc.pub/api/player/' + qq);
      return response || { status: 200, body: JSON.stringify({ nickname: '新玩家', rating: 15000, play_count: 12 }) };
    } },
    card: { async saveSnapshot(snapshot) {
      if (saveSnapshot) await saveSnapshot(snapshot);
      snapshots.push(snapshot);
    } }
  };
  const context = vm.createContext({ bridge, MaiProfile });
  vm.runInContext(readFileSync('src/background.js', 'utf8'), context);
  return { refresh: context.refresh, calls, snapshots, get profile() { return profile; } };
}

test('background refresh fetches only public data and awaits a compatible cached-image snapshot', async () => {
  let finishSave;
  const saved = new Promise(resolve => { finishSave = resolve; });
  const b = background({ saveSnapshot: () => saved });
  let done = false;
  const pending = b.refresh().then(() => { done = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.calls.length, 1, '旧版自动刷新设置不影响桥调度');
  assert.equal(done, false, '快照保存完成前不能结束后台任务');
  finishSave();
  await pending;
  assert.equal(b.snapshots.length, 1);
  const snapshot = b.snapshots[0];
  assert.equal(snapshot.profile.name, '新玩家');
  assert.equal(snapshot.profile.rating, 15000);
  assert.equal(snapshot.profile.playCount, 12);
  assert.equal(snapshot.profile.title, '称号');
  assert.equal(snapshot.profile.fullUpdatedAt, 100);
  assert.equal(snapshot.images.icon, 'data:image/png;base64,AA');
  assert.deepEqual(snapshot.profile, b.profile);
});

test('background without a configured QQ skips network and snapshot writes', async () => {
  const b = background({ qq: '' });
  await b.refresh();
  assert.equal(b.calls.length, 0);
  assert.equal(b.snapshots.length, 0);
});

test('failed background requests preserve cached data and snapshots without retrying', async () => {
  const b = background({ response: { status: 503, body: '' } });
  await assert.rejects(b.refresh(), /503/);
  assert.equal(b.calls.length, 1);
  assert.equal(b.profile.name, '缓存玩家');
  assert.equal(b.snapshots.length, 0);
});
