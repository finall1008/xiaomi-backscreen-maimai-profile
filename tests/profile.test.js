/*
 * 共享资料服务（src/shared/profile.js）的业务测试。
 * 只用一个最小假桥（config / storage / files / net），不搭大型 mock。
 * 运行：node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MaiProfile = require('../src/shared/profile.js');

const PUBLIC_URL = 'https://net.wmc.pub/api/player/';
const FULL_URL = 'https://api.wmc.pub/v1/user/data';
const CHECKIN_URL = 'https://api.wmc.pub/checkin';
const TROPHY_URL = 'https://maimai.lxns.net/api/v0/maimai/trophy/';
const ICON_URL = 'https://assets2.lxns.net/maimai/icon/';
const PLATE_URL = 'https://assets2.lxns.net/maimai/plate/';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** 最小假桥：与会话存储一样按值拷贝，模拟 JSON 序列化边界。 */
function createFakeBridge(options = {}) {
  const config = clone(options.config) || {};
  const storage = clone(options.storage) || {};
  const files = clone(options.files) || {};
  const routes = options.routes || {};
  const calls = { net: [], configSet: [] };

  return {
    config,
    storage,
    files,
    calls,
    bridge: {
      config: {
        async get(key) {
          if (key === undefined) return clone(config);
          return key in config ? clone(config[key]) : null;
        },
        async set(key, value) {
          calls.configSet.push(key);
          config[key] = clone(value);
          return true;
        }
      },
      storage: {
        async get(key) {
          if (options.denyTokenRead && key === 'gatewayToken') {
            throw Object.assign(new Error('卡片端不应读取令牌'), { code: 'DENIED' });
          }
          return key in storage ? clone(storage[key]) : null;
        },
        async set(key, value) {
          storage[key] = clone(value);
          return true;
        },
        async remove(key) {
          delete storage[key];
          return true;
        },
        async keys() {
          return Object.keys(storage);
        }
      },
      files: {
        async writeText(path, content) {
          files[path] = content;
          return true;
        },
        async readText(path) {
          if (!(path in files)) throw Object.assign(new Error('文件不存在。'), { code: 'ERROR' });
          return files[path];
        },
        async remove(path) {
          delete files[path];
          return true;
        },
        async list() {
          return [];
        }
      },
      net: {
        async request(payload) {
          calls.net.push(payload);
          const route = routes[payload.url];
          if (route === undefined) throw new Error('测试未配置的请求：' + payload.url);
          if (typeof route === 'function') return route(payload);
          if (route instanceof Error) throw route;
          return clone(route);
        }
      },
      log: { info() {}, warn() {}, error() {} }
    }
  };
}

function jsonRoute(value) {
  return { status: 200, body: JSON.stringify(value) };
}

function seededSettings(overrides = {}) {
  return Object.assign({ publicQq: '123456' }, overrides);
}

function decoratedProfile(overrides = {}) {
  return Object.assign({
    name: 'before',
    rating: 15100,
    playCount: 1200,
    iconId: 256001,
    plateId: 559501,
    frameId: 559504,
    titleId: 508571,
    title: '称号',
    titleColor: 'gold',
    courseRank: 5,
    classRank: 2,
    publicUpdatedAt: 100,
    fullUpdatedAt: 200,
    account: '123456'
  }, overrides);
}

test('公开刷新只覆盖昵称、Rating、游玩次数，保留完整资料装饰', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile(), gatewayToken: 'gw_secret' },
    routes: {
      [PUBLIC_URL + '123456']: jsonRoute({ nickname: 'after', rating: 15158, play_count: 1315 })
    }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const profile = await repository.refreshPublic();

  assert.equal(profile.name, 'after');
  assert.equal(profile.rating, 15158);
  assert.equal(profile.playCount, 1315);
  assert.ok(profile.publicUpdatedAt > 0);
  // 装饰字段（含公开接口没有返回的姓名框）必须原样保留。
  assert.equal(profile.plateId, 559501);
  assert.equal(profile.frameId, 559504);
  assert.equal(profile.iconId, 256001);
  assert.equal(profile.title, '称号');
  assert.equal(profile.titleColor, 'gold');
  assert.equal(profile.courseRank, 5);
  assert.equal(profile.classRank, 2);
  assert.equal(profile.fullUpdatedAt, 200);
  assert.equal(profile.account, '123456');
  assert.deepEqual(fake.storage.profile, profile);
});

test('公开请求失败时保留旧缓存，不写坏资料', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile() },
    routes: { [PUBLIC_URL + '123456']: { status: 404, body: '{"msg":"player not found"}' } }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  await assert.rejects(() => repository.refreshPublic(), /请求失败（404）：player not found/);
  assert.equal(fake.storage.profile.name, 'before');
  assert.equal(fake.storage.profile.rating, 15100);
});

test('换号清理旧资料，且不拼接两位玩家的数据', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings({ publicQq: '123456' }) },
    storage: { profile: decoratedProfile(), gatewayToken: 'gw_secret' }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const saved = await repository.saveSettings({
    publicQq: '654321',
    gatewayToken: 'gw_new'
  });
  assert.deepEqual(saved, { publicQq: '654321', gatewayToken: 'gw_new' });
  assert.equal('profile' in fake.storage, false, '换号后旧资料必须清除');

  const blank = await repository.getProfile();
  assert.equal(blank.account, '654321');
  assert.equal(blank.name, '');
  assert.equal(blank.iconId, 0);
  assert.equal(blank.fullUpdatedAt, 0);
});

test('缓存所属 QQ 与设置不一致时返回空资料', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings({ publicQq: '999999' }) },
    storage: { profile: decoratedProfile({ account: '123456' }) }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const profile = await repository.getProfile();
  assert.equal(profile.name, '');
  assert.equal(profile.account, '999999');
});

test('设置校验拒绝非数字 QQ，配置里不含令牌或旧版调度设置', async () => {
  const fake = createFakeBridge({ config: {}, storage: {} });
  const repository = MaiProfile.createRepository(fake.bridge);

  await assert.rejects(
    () => repository.saveSettings({ publicQq: '12a34' }),
    /请输入正确的 QQ 号/
  );

  await repository.saveSettings({
    publicQq: ' 123456 ',
    gatewayToken: ' gw_token ',
    autoRefresh: true,
    refreshIntervalMinutes: 15
  });
  assert.deepEqual(fake.config.settings, { publicQq: '123456' });
  assert.equal(fake.storage.gatewayToken, 'gw_token');
  assert.equal(JSON.stringify(fake.config).includes('gw_token'), false, '配置对象中不允许出现令牌');

  const settings = await repository.getSettings();
  assert.equal(settings.gatewayToken, 'gw_token');
  assert.equal(settings.publicQq, '123456');

  const blank = createFakeBridge({ config: {}, storage: {} });
  const blankRepository = MaiProfile.createRepository(blank.bridge);
  const defaults = await blankRepository.getSettings();
  assert.deepEqual(defaults, { publicQq: '', gatewayToken: '' });
});

test('卡片端只读 config 设置，免费刷新不读取令牌', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile() },
    routes: { [PUBLIC_URL + '123456']: jsonRoute({ nickname: 'card', rating: 15000, play_count: 900 }) },
    denyTokenRead: true
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const settings = await repository.getCardSettings();
  assert.deepEqual(settings, { publicQq: '123456' });

  const profile = await repository.refreshPublic();
  assert.equal(profile.name, 'card');
  assert.equal(profile.rating, 15000);
  assert.equal(profile.playCount, 900);
  assert.deepEqual(Object.keys(settings).includes('gatewayToken'), false);
});

test('官方图片链接转换为二维码凭据，其他格式原样转发', () => {
  assert.equal(
    MaiProfile.parseOfficialQr('https://wq.wahlap.net/qrcode/img/MAID261012160211ABCD.png?v'),
    'SGWCMAID261012160211ABCD'
  );
  assert.equal(MaiProfile.parseOfficialQr(' SGWCMAID261012160211ABCD '), 'SGWCMAID261012160211ABCD');
  assert.equal(
    MaiProfile.parseOfficialQr(' https://wq.wahlap.net/wm/?accessToken=example '),
    'https://wq.wahlap.net/wm/?accessToken=example'
  );
  assert.equal(MaiProfile.parseOfficialQr('https://example.com/MAID261012160211ABCD.png'), 'https://example.com/MAID261012160211ABCD.png');
  assert.throws(() => MaiProfile.parseOfficialQr('   '), /请输入二维码内容或网页地址/);
});

test('签到识别 400 Already checked in today 为今日已签到', async () => {
  let body = { status: 400, body: '{"msg":"Already checked in today"}' };
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { gatewayToken: 'gw_token' },
    routes: { [CHECKIN_URL]: () => body }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  assert.equal(await repository.checkIn(), '今日已签到');

  body = jsonRoute({ msg: '签到成功，获得 1 Token' });
  assert.equal(await repository.checkIn(), '签到成功，获得 1 Token');

  body = jsonRoute({});
  assert.equal(await repository.checkIn(), '签到成功');

  body = { status: 400, body: '{"msg":"token expired"}' };
  await assert.rejects(() => repository.checkIn(), /请求失败（400）：token expired/);

  body = { status: 401, body: '{"message":"无额度"}' };
  await assert.rejects(() => repository.checkIn(), /请求失败（401）：无额度/);

  assert.equal(fake.calls.net.length, 5);
  assert.equal(fake.calls.net[0].headers.Authorization, 'Bearer gw_token');
});

test('账号或令牌未配置时不发送对应请求', async () => {
  const fake = createFakeBridge({ config: { settings: seededSettings() }, storage: {} });
  const repository = MaiProfile.createRepository(fake.bridge);

  await assert.rejects(() => repository.checkIn(), /请先保存 AWMC 网关令牌/);
  await assert.rejects(() => repository.refreshFull('SGWC1'), /请先保存 AWMC 网关令牌/);
  assert.equal(fake.calls.net.length, 0);

  const noQq = createFakeBridge({ config: { settings: seededSettings({ publicQq: '' }) }, storage: {} });
  const noQqRepository = MaiProfile.createRepository(noQq.bridge);
  await assert.rejects(() => noQqRepository.refreshPublic(), /请先保存公开 API 的 QQ 号/);
  assert.equal(noQq.calls.net.length, 0);
});

test('完整资料查询：单次 POST、固定 180000ms、二维码仅本次使用', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile(), gatewayToken: 'gw_token' },
    routes: {
      [FULL_URL]: jsonRoute({
        returnCode: 1,
        businessData: {
          userData: {
            userName: 'full',
            playerRating: 15200,
            playCount: 1300,
            iconId: 11,
            plateId: 22,
            frameId: 33,
            titleId: 508571,
            courseRank: 4,
            classRank: 3
          }
        }
      }),
      [TROPHY_URL + '508571']: jsonRoute({ name: '称号X', color: 'GOLD' })
    }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const profile = await repository.refreshFull('https://wq.wahlap.net/qrcode/img/MAID261012160211ABCD.png?v');

  const fullCalls = fake.calls.net.filter((call) => call.url === FULL_URL);
  assert.equal(fullCalls.length, 1, '完整查询必须只发一次');
  assert.equal(fullCalls[0].method, 'POST');
  assert.equal(fullCalls[0].timeoutMs, 180000);
  assert.equal(fullCalls[0].headers.Authorization, 'Bearer gw_token');
  assert.deepEqual(JSON.parse(fullCalls[0].body), { qrcode: 'SGWCMAID261012160211ABCD' });

  assert.equal(profile.name, 'full');
  assert.equal(profile.rating, 15200);
  assert.equal(profile.playCount, 1300);
  assert.equal(profile.iconId, 11);
  assert.equal(profile.plateId, 22);
  assert.equal(profile.frameId, 33);
  assert.equal(profile.titleId, 508571);
  assert.equal(profile.title, '称号X');
  assert.equal(profile.titleColor, 'gold');
  assert.equal(profile.courseRank, 4);
  assert.equal(profile.classRank, 3);
  assert.equal(profile.account, '123456');
  assert.ok(profile.fullUpdatedAt > 0);
  // 二维码不落盘、不写配置、不写日志。
  assert.equal(JSON.stringify(fake.storage).includes('SGWCMAID'), false);
  assert.equal(JSON.stringify(fake.config).includes('SGWCMAID'), false);
});

test('完整资料查询超时不重试，且保留旧资料', async () => {
  const timeout = Object.assign(new Error('网络请求超时，结果未知；请核实服务端结果，不要自动重试付费请求。'), { code: 'TIMEOUT' });
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile(), gatewayToken: 'gw_token' },
    routes: { [FULL_URL]: () => { throw timeout; } }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  await assert.rejects(() => repository.refreshFull('SGWC1'), (error) => {
    assert.equal(error.code, 'TIMEOUT');
    return true;
  });
  assert.equal(fake.calls.net.filter((call) => call.url === FULL_URL).length, 1, '超时后不得自动重试');
  assert.equal(fake.storage.profile.name, 'before');
  assert.equal(fake.storage.profile.fullUpdatedAt, 200);
});

test('完整查询失败：非 2xx 显式失败，响应不是 JSON 时给出明确提示', async () => {
  const rejected = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { gatewayToken: 'gw_token' },
    routes: { [FULL_URL]: { status: 402, body: '{"msg":"Insufficient tokens"}' } }
  });
  await assert.rejects(
    () => MaiProfile.createRepository(rejected.bridge).refreshFull('SGWC1'),
    /请求失败（402）：Insufficient tokens/
  );
  assert.equal(rejected.calls.net.length, 1);

  const broken = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { gatewayToken: 'gw_token' },
    routes: { [FULL_URL]: { status: 200, body: '<html>gateway</html>' } }
  });
  await assert.rejects(
    () => MaiProfile.createRepository(broken.bridge).refreshFull('SGWC1'),
    /接口返回的数据无法解析为 JSON（HTTP 200）/
  );

  const businessError = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { gatewayToken: 'gw_token' },
    routes: { [FULL_URL]: jsonRoute({ returnCode: -1, returnMessage: '二维码已失效' }) }
  });
  await assert.rejects(
    () => MaiProfile.createRepository(businessError.bridge).refreshFull('SGWC1'),
    /完整资料查询失败：二维码已失效/
  );
});

test('完整查询支持 returnMessage 内嵌的 JSON 资料', async () => {
  const inner = JSON.stringify({ userData: { userName: 'inner', playerRating: 14000, iconId: 5, titleId: 0 } });
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { gatewayToken: 'gw_token' },
    routes: { [FULL_URL]: jsonRoute({ returnCode: 1, returnMessage: inner }) }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const profile = await repository.refreshFull('SGWC1');
  assert.equal(profile.name, 'inner');
  assert.equal(profile.rating, 14000);
  assert.equal(profile.iconId, 5);
  assert.equal(profile.titleId, 0);
  assert.equal(profile.title, '');
  assert.equal(fake.calls.net.filter((call) => call.url.startsWith(TROPHY_URL)).length, 0);
});

test('完整查询保留同称号的文字与颜色，称号元数据失败不影响资料', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile({ titleId: 508571, title: '旧称号', titleColor: 'rainbow' }), gatewayToken: 'gw_token' },
    routes: {
      [FULL_URL]: jsonRoute({ returnCode: 1, businessData: { userData: { titleId: 508571, iconId: 7 } } }),
      [TROPHY_URL + '508571']: { status: 500, body: '{"msg":"upstream error"}' }
    }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const profile = await repository.refreshFull('SGWC1');
  assert.equal(profile.titleId, 508571);
  assert.equal(profile.title, '旧称号');
  assert.equal(profile.titleColor, 'rainbow');
  assert.equal(profile.iconId, 7);
});

test('prepareImages 按尺寸处理并写入缓存，重复调用不再下载', async () => {
  const processed = [];
  const processor = async (dataUrl, options) => {
    processed.push({ dataUrl, options });
    return 'data:image/png;base64,PROCESSED-' + options.kind;
  };
  const profile = decoratedProfile({ frameId: 0, courseRank: 0, classRank: 0 });
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile },
    routes: {
      [ICON_URL + '256001.png']: { status: 200, bodyBase64: 'AAAA' },
      [PLATE_URL + '559501.png']: { status: 200, bodyBase64: 'BBBB' }
    }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const first = await repository.prepareImages(profile, processor);
  assert.deepEqual(first.warnings, []);
  assert.equal(first.images.icon, 'data:image/png;base64,PROCESSED-icon');
  assert.equal(first.images.plate, 'data:image/png;base64,PROCESSED-plate');
  assert.equal(first.images.frame, undefined, 'id 为 0 的素材不准备');
  assert.equal(fake.calls.net.length, 2);
  assert.equal(processed[0].dataUrl, 'data:image/png;base64,AAAA');
  assert.deepEqual(processed[0].options, { kind: 'icon', maxWidth: 146, maxHeight: 146, lossy: false });
  assert.deepEqual(processed[1].options, { kind: 'plate', maxWidth: 568, maxHeight: 92, lossy: false });
  assert.equal(fake.files['cache/images/icon-256001.txt'], 'data:image/png;base64,PROCESSED-icon');
  assert.equal(fake.files['cache/images/plate-559501.txt'], 'data:image/png;base64,PROCESSED-plate');

  const second = await repository.prepareImages(profile, async () => {
    throw new Error('缓存命中时不应重新处理');
  });
  assert.deepEqual(second.warnings, []);
  assert.equal(second.images.icon, 'data:image/png;base64,PROCESSED-icon');
  assert.equal(fake.calls.net.length, 2, '缓存命中不应重新下载');

  const images = await repository.getImages(profile);
  assert.deepEqual(Object.keys(images).sort(), ['icon', 'plate']);
  assert.equal(images.plate, 'data:image/png;base64,PROCESSED-plate');

  const other = await repository.getImages(decoratedProfile({ iconId: 999, plateId: 998, frameId: 0 }));
  assert.deepEqual(other, {}, '缓存按 kind+id 命中，不会跨 id 冒用');
});

test('背景素材按 WebP(lossy) 规格处理', async () => {
  const processed = [];
  const profile = decoratedProfile({ iconId: 0, plateId: 0, courseRank: 0, classRank: 0 });
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile },
    routes: { [MaiProfile.imageUrl('frame', 559504)]: { status: 200, bodyBase64: 'FRAME' } }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const result = await repository.prepareImages(profile, async (dataUrl, options) => {
    processed.push(options);
    return 'data:image/webp;base64,SMALL';
  });

  assert.deepEqual(processed, [{ kind: 'frame', maxWidth: 1424, maxHeight: 596, lossy: true }]);
  assert.equal(result.images.frame, 'data:image/webp;base64,SMALL');
  assert.equal(fake.files['cache/images/frame-559504.txt'], 'data:image/webp;base64,SMALL');
});

test('素材失败只警告并继续准备其余素材', async () => {
  const profile = decoratedProfile({ frameId: 0, courseRank: 0, classRank: 0 });
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile },
    routes: {
      [ICON_URL + '256001.png']: { status: 500, body: '{}' },
      [PLATE_URL + '559501.png']: { status: 200, bodyBase64: 'BBBB' }
    }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const result = await repository.prepareImages(profile, async (dataUrl, options) => 'data:image/png;base64,' + options.kind);

  assert.equal(result.images.icon, undefined);
  assert.equal(result.images.plate, 'data:image/png;base64,plate');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /^icon：/);
  assert.equal('cache/images/icon-256001.txt' in fake.files, false);
  assert.equal(fake.calls.net.filter((call) => call.url === FULL_URL).length, 0, '素材失败不得触发付费查询');
});

test('素材超过 512 KiB 缓存上限时只警告，不写文件', async () => {
  const profile = decoratedProfile({ plateId: 0, frameId: 0, courseRank: 0, classRank: 0 });
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile },
    routes: { [ICON_URL + '256001.png']: { status: 200, bodyBase64: 'AAAA' } }
  });
  const repository = MaiProfile.createRepository(fake.bridge);

  const huge = 'data:image/png;base64,' + 'A'.repeat(512 * 1024);
  const result = await repository.prepareImages(profile, async () => huge);

  assert.equal(result.images.icon, undefined);
  assert.match(result.warnings[0], /512 KiB 缓存上限/);
  assert.equal('cache/images/icon-256001.txt' in fake.files, false);
});

test('背屏请求进行中切换 QQ，不把旧响应写进新账号缓存', async () => {
  let resolveRequest;
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { profile: decoratedProfile() },
    routes: { [PUBLIC_URL + '123456']: () => new Promise(resolve => { resolveRequest = resolve; }) }
  });
  const repository = MaiProfile.createRepository(fake.bridge);
  const request = repository.refreshPublic();
  await new Promise(resolve => setImmediate(resolve));
  await repository.saveSettings(seededSettings({ publicQq: '654321', gatewayToken: '' }));
  resolveRequest(jsonRoute({ nickname: '旧账号', rating: 1000, play_count: 10 }));
  await assert.rejects(request, error => error.code === 'ACCOUNT_CHANGED');
  assert.equal((await repository.getProfile()).account, '654321');
  assert.equal((await repository.getProfile()).name, '');
  assert.equal(fake.storage.profile, undefined);
});

test('首次填写 QQ 不沿用无所属账号的完整资料', async () => {
  const fake = createFakeBridge({ storage: { profile: decoratedProfile({ account: '' }) } });
  const repository = MaiProfile.createRepository(fake.bridge);
  await repository.saveSettings(seededSettings({ gatewayToken: '' }));
  assert.equal((await repository.getProfile()).iconId, 0);
});

test('设置页 bridge 没有 net 时，所有网络业务使用传入的请求函数', async () => {
  const fake = createFakeBridge({
    config: { settings: seededSettings() },
    storage: { gatewayToken: 'test-token' },
    routes: {
      [PUBLIC_URL + '123456']: jsonRoute({ nickname: '公开玩家', rating: 15000 }),
      [FULL_URL]: jsonRoute({ returnCode: 1, businessData: { userData: { userName: '完整玩家', iconId: 7 } } }),
      [CHECKIN_URL]: jsonRoute({ msg: '签到成功' }),
      [ICON_URL + '7.png']: { status: 200, bodyBase64: 'dGVzdA==' }
    }
  });
  const directRequest = fake.bridge.net.request;
  delete fake.bridge.net;
  const repository = MaiProfile.createRepository(fake.bridge, directRequest);
  assert.equal((await repository.refreshPublic()).rating, 15000);
  const profile = await repository.refreshFull('test-qr');
  assert.equal(profile.name, '完整玩家');
  assert.equal(await repository.checkIn(), '签到成功');
  const prepared = await repository.prepareImages(profile, async data => data);
  assert.equal(prepared.images.icon, 'data:image/png;base64,dGVzdA==');
  assert.deepEqual(fake.calls.net.map(call => call.url), [PUBLIC_URL + '123456', FULL_URL, CHECKIN_URL, ICON_URL + '7.png']);
  assert.equal(fake.calls.net[1].timeoutMs, 180000);
});
