/*
 * 舞萌背屏卡片模块 · 设置页（主屏 WebUI）入口。
 *
 * 由构建脚本与 src/shared/profile.js、卡片绘制脚本合并为 webroot/main.js。
 * 依赖宿主提供、且不被复制进模块包的 bridge-shim.js（window.bridge）；
 * 直接当普通网页打开时不会伪造 bridge，也不会发送任何真实请求。
 *
 * 责任划分：
 *   设置页：保存设置、公开刷新、完整资料查询（2 Token）、签到、动态图片处理与预览。
 *   卡片：显示缓存、运行期间的免费刷新；设置页写入后调用 bridge.card.requestRefresh() 通知它。
 */
(function () {
  'use strict';

  var api = typeof globalThis !== 'undefined' ? globalThis.MaiProfile : null;
  var bridge = typeof window !== 'undefined' ? window.bridge : undefined;

  var state = {
    repository: null,
    renderer: null,
    busy: false,
    status: '加载中…',
    profile: null,
    images: {},
    settings: null,
    notice: ''
  };

  var dom = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    dom.canvas = byId('preview');
    dom.factName = byId('fact-name');
    dom.factTitle = byId('fact-title');
    dom.factPublic = byId('fact-public');
    dom.factFull = byId('fact-full');
    dom.status = byId('status');
    dom.error = byId('error');
    dom.notice = byId('notice');
    dom.refreshPublic = byId('refresh-public');
    dom.openFull = byId('open-full');
    dom.checkIn = byId('check-in');
    dom.retryAssets = byId('retry-assets');
    dom.fullPanel = byId('full-panel');
    dom.fullQr = byId('full-qr');
    dom.fullCancel = byId('full-cancel');
    dom.fullConfirm = byId('full-confirm');
    dom.setQq = byId('set-qq');
    dom.setToken = byId('set-token');
    dom.setAuto = byId('set-auto');
    dom.setInterval = byId('set-interval');
    dom.save = byId('save');
    dom.actionButtons = [dom.refreshPublic, dom.openFull, dom.checkIn, dom.retryAssets, dom.fullConfirm, dom.fullCancel, dom.save];
  }

  /* ---------- 视图 ---------- */

  function text(value, fallback) {
    return value === undefined || value === null || value === '' ? fallback : String(value);
  }

  function formatTime(stamp) {
    var value = Number(stamp);
    if (!isFinite(value) || value <= 0) return '尚未更新';
    var date = new Date(value);
    function pad(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function setStatus(message) {
    state.status = message;
    if (dom.status) dom.status.textContent = message;
    renderRefreshState();
  }

  function showError(message) {
    if (!dom.error) return;
    if (!message) {
      dom.error.hidden = true;
      dom.error.textContent = '';
      return;
    }
    dom.error.hidden = false;
    dom.error.textContent = message;
  }

  function showNotice(message) {
    state.notice = message || '';
    if (!dom.notice) return;
    dom.notice.hidden = !state.notice;
    dom.notice.textContent = state.notice;
  }

  function errorText(error) {
    if (!error) return '操作失败';
    if (error.code === 'TIMEOUT') return '请求超时';
    return error.message || error.code || '操作失败';
  }

  function setControlsEnabled() {
    var locked = state.busy || !state.repository;
    dom.actionButtons.forEach(function (button) {
      if (button) button.disabled = locked;
    });
    [dom.setQq, dom.setToken, dom.setAuto, dom.setInterval].forEach(function (input) {
      if (input) input.disabled = locked;
    });
  }

  function renderRefreshState() {
    if (!state.renderer || typeof state.renderer.setRefreshState !== 'function') return;
    state.renderer.setRefreshState({ pull: false, busy: state.busy, message: state.status });
  }

  function renderPreview() {
    if (!state.renderer || typeof state.renderer.setProfile !== 'function') return;
    state.renderer.setProfile(state.profile || api.emptyProfile(), state.images || {});
    renderRefreshState();
    if (typeof state.renderer.requestDraw === 'function') state.renderer.requestDraw();
  }

  function renderFacts() {
    var profile = state.profile || api.emptyProfile();
    if (dom.factName) dom.factName.textContent = text(profile.name, '—');
    if (dom.factTitle) dom.factTitle.textContent = text(profile.title, '—');
    if (dom.factPublic) dom.factPublic.textContent = formatTime(profile.publicUpdatedAt);
    if (dom.factFull) dom.factFull.textContent = formatTime(profile.fullUpdatedAt);
    // 只有拿到过完整资料（或素材准备失败后）才有动态素材需要重试。
    if (dom.retryAssets) dom.retryAssets.hidden = !(profile.fullUpdatedAt > 0);
  }

  function fillSettingsForm(settings) {
    if (!settings) return;
    if (dom.setQq) dom.setQq.value = settings.publicQq || '';
    // 令牌只写入输入框，不写日志、不放进页面文本。
    if (dom.setToken) dom.setToken.value = settings.gatewayToken || '';
    if (dom.setAuto) dom.setAuto.checked = settings.autoRefresh !== false;
    if (dom.setInterval) dom.setInterval.value = String(settings.refreshIntervalMinutes || api.defaultIntervalMinutes);
  }

  /* ---------- 预览组件（由构建产物提供 window.MaiRenderer） ---------- */

  function setupRenderer() {
    var rendererFactory = typeof window !== 'undefined' ? window.MaiRenderer : null;
    if (!rendererFactory || typeof rendererFactory.create !== 'function' || !dom.canvas) {
      showError('预览加载失败');
      return null;
    }
    try {
      return rendererFactory.create(dom.canvas, { assetBase: 'assets/' });
    } catch (error) {
      showError('预览加载失败');
      return null;
    }
  }

  /* ---------- 图片处理（HTML Canvas，缩放不放大原图） ---------- */

  function processImage(dataUrl, options) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        try {
          var width = image.naturalWidth || image.width;
          var height = image.naturalHeight || image.height;
          if (!width || !height) throw new Error('图片尺寸无效');
          var scale = Math.min(1, options.maxWidth / width, options.maxHeight / height);
          var targetWidth = Math.max(1, Math.round(width * scale));
          var targetHeight = Math.max(1, Math.round(height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          var context = canvas.getContext('2d');
          if (!context) throw new Error('无法创建 Canvas 上下文');
          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          var encoded = options.lossy
            ? canvas.toDataURL('image/webp', 0.9)
            : canvas.toDataURL('image/png');
          if (typeof encoded !== 'string' || encoded.indexOf('data:') !== 0) throw new Error('图片编码失败');
          resolve(encoded);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = function () {
        reject(new Error('图片解码失败'));
      };
      image.src = dataUrl;
    });
  }

  /* ---------- 与卡片联动 ---------- */

  /** 数据已经写入，通知失败只是提示卡片下次自己读取。 */
  async function notifyCard() {
    if (!bridge || !bridge.card || typeof bridge.card.requestRefresh !== 'function') return false;
    try {
      await bridge.card.requestRefresh();
      return true;
    } catch (error) {
      return false;
    }
  }

  async function saveAndNotifySaved(okMessage, failedMessage) {
    var notified = await notifyCard();
    setStatus(notified ? okMessage : failedMessage);
  }

  /* ---------- 数据读取 ---------- */

  async function loadFromCache() {
    var settings = await state.repository.getSettings();
    var profile = await state.repository.getProfile();
    var images = await state.repository.getImages(profile);
    state.settings = settings;
    state.profile = profile;
    state.images = images;
    fillSettingsForm(settings);
    renderFacts();
    renderPreview();
    return { settings: settings, profile: profile };
  }

  /* ---------- 操作 ---------- */

  function runAction(busyMessage, action) {
    if (state.busy || !state.repository) return Promise.resolve(false);
    state.busy = true;
    showError('');
    showNotice('');
    setStatus(busyMessage);
    setControlsEnabled();
    renderRefreshState();
    return Promise.resolve()
      .then(action)
      .then(function () {
        return true;
      })
      .catch(function (error) {
        showError(errorText(error));
        setStatus('操作失败');
        return false;
      })
      .then(function (ok) {
        state.busy = false;
        setControlsEnabled();
        renderRefreshState();
        return ok;
      });
  }

  async function afterProfileChanged(message) {
    state.profile = await state.repository.getProfile();
    state.images = await state.repository.getImages(state.profile);
    renderFacts();
    renderPreview();
    setStatus(message);
  }

  async function refreshPublic() {
    var ok = await runAction('正在读取公开资料…', async function () {
      await state.repository.refreshPublic();
      await afterProfileChanged('公开资料已刷新');
      await saveAndNotifySaved('公开资料已刷新', '公开资料已刷新，背屏通知失败');
    });
    return ok;
  }

  async function autoRefreshIfDue() {
    if (!state.repository) return false;
    var settings = state.settings || (await state.repository.getSettings());
    if (!api.isRefreshDue(settings, state.profile)) return false;
    setStatus('正在刷新公开资料…');
    return refreshPublic();
  }

  async function refreshFull(qr) {
    return runAction('正在查询完整资料…', async function () {
      var profile = await state.repository.refreshFull(qr);
      state.profile = profile;
      renderFacts();
      // 付费结果已经保存；素材失败只提示，不会再次发起付费查询。
      var prepared = await state.repository.prepareImages(profile, processImage);
      state.images = prepared.images;
      renderPreview();
      if (prepared.warnings.length) {
        showNotice('素材加载失败：' + prepared.warnings.join('；'));
      } else {
        showNotice('');
      }
      var titleMissing = profile.titleId > 0 && !profile.title;
      await saveAndNotifySaved(
        titleMissing ? '完整资料已更新，称号文字获取失败' : '完整资料已更新',
        '完整资料已保存，背屏通知失败'
      );
    });
  }

  async function checkIn() {
    return runAction('正在签到…', async function () {
      var message = await state.repository.checkIn();
      setStatus(message);
    });
  }

  /**
   * 只重试动态素材：调用 prepareImages，绝不重新发起消耗 Token 的完整查询。
   */
  async function retryAssets() {
    if (!state.repository || !state.profile) return false;
    return runAction('正在重试图片素材…', async function () {
      var prepared = await state.repository.prepareImages(state.profile, processImage);
      state.images = prepared.images;
      renderPreview();
      if (prepared.warnings.length) {
        showNotice('素材加载失败：' + prepared.warnings.join('；'));
        await saveAndNotifySaved('素材已部分更新', '素材已部分保存，背屏通知失败');
        return;
      }
      showNotice('');
      await saveAndNotifySaved('素材已更新', '素材已更新，背屏通知失败');
    });
  }

  async function saveSettings() {
    if (state.busy || !state.repository) return false;
    var input = {
      publicQq: dom.setQq ? dom.setQq.value : '',
      gatewayToken: dom.setToken ? dom.setToken.value : '',
      autoRefresh: dom.setAuto ? dom.setAuto.checked : true,
      refreshIntervalMinutes: dom.setInterval ? dom.setInterval.value : ''
    };
    var ok = await runAction('正在保存设置…', async function () {
      var saved = await state.repository.saveSettings(input);
      state.settings = saved;
      fillSettingsForm(saved);
      state.profile = await state.repository.getProfile();
      state.images = await state.repository.getImages(state.profile);
      renderFacts();
      renderPreview();
      await saveAndNotifySaved('设置已保存', '设置已保存，背屏通知失败');
    });
    if (ok) await autoRefreshIfDue();
    return ok;
  }

  function openFullPanel() {
    if (state.busy || !state.repository) return;
    if (dom.fullPanel) dom.fullPanel.hidden = false;
    if (dom.fullQr) {
      dom.fullQr.value = '';
      dom.fullQr.focus();
    }
  }

  function closeFullPanel() {
    if (dom.fullPanel) dom.fullPanel.hidden = true;
    // 二维码内容只用于当次请求：提交或取消后立即清空，不写入设置、日志或模块包。
    if (dom.fullQr) dom.fullQr.value = '';
  }

  async function confirmFull() {
    var qr = dom.fullQr ? dom.fullQr.value.trim() : '';
    closeFullPanel();
    if (qr === '') {
      showError('请输入二维码内容或网页地址');
      return;
    }
    await refreshFull(qr);
  }

  /** storage 没有变更通知：回到页面时重读缓存（不轮询、不下载大图）。 */
  async function refreshFromCacheOnReturn() {
    if (!state.repository || state.busy) return;
    try {
      await loadFromCache();
      setStatus('资料已加载');
    } catch (error) {
      showError(errorText(error));
    }
  }

  function bindEvents() {
    if (dom.refreshPublic) dom.refreshPublic.addEventListener('click', function () { refreshPublic(); });
    if (dom.openFull) dom.openFull.addEventListener('click', openFullPanel);
    if (dom.fullCancel) dom.fullCancel.addEventListener('click', closeFullPanel);
    if (dom.fullConfirm) dom.fullConfirm.addEventListener('click', function () { confirmFull(); });
    if (dom.checkIn) dom.checkIn.addEventListener('click', function () { checkIn(); });
    if (dom.retryAssets) dom.retryAssets.addEventListener('click', function () { retryAssets(); });
    if (dom.save) dom.save.addEventListener('click', function () { saveSettings(); });
    if (dom.fullQr) {
      dom.fullQr.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') confirmFull();
      });
    }
    window.addEventListener('focus', function () { refreshFromCacheOnReturn(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshFromCacheOnReturn();
    });
  }

  function showBridgeRequired() {
    // 普通浏览器打开：不伪造 bridge，不发送真实请求，也不读本地资料。
    setStatus('未连接卡片桥');
    state.repository = null;
    setControlsEnabled();
  }

  function boot() {
    cacheDom();
    if (!api) {
      if (dom.error) {
        dom.error.hidden = false;
        dom.error.textContent = '加载失败';
      }
      return;
    }
    state.renderer = setupRenderer();
    state.profile = api.emptyProfile();
    renderFacts();
    renderPreview();
    if (!bridge || !bridge.module || !bridge.config || !bridge.storage) {
      showBridgeRequired();
      return;
    }
    try {
      state.repository = api.createRepository(bridge, window.MaiWebRequest);
    } catch (error) {
      showBridgeRequired();
      return;
    }
    bindEvents();
    setControlsEnabled();
    (async function () {
      try {
        await loadFromCache();
        setStatus('资料已加载');
      } catch (error) {
        showError(errorText(error));
        setStatus('资料加载失败');
        return;
      }
      // 设置页打开时按到期规则自动读取公开资料（完整查询与签到始终手动）。
      await autoRefreshIfDue();
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
