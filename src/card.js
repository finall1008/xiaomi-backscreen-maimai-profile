/* Rear-screen entry: cached profile and manual pull-to-refresh only. */
(function (root) {
  'use strict';
  function start(canvas, bridge) {
    if (root.__maiCardDispose) root.__maiCardDispose();
    var renderer = root.MaiRenderer.create(canvas, { assetBase: 'assets/' });
    var dead = false, busy = false, loadRevision = 0, clearMessage = null;
    if (!bridge) {
      renderer.setRefreshState({ message: '未连接卡片桥' });
      root.__maiCardDispose = renderer.dispose;
      return { dispose: renderer.dispose };
    }
    var repository = root.MaiProfile.createRepository(bridge);
    function message(value) {
      if (dead) return;
      renderer.setRefreshState({ message: value });
      if (clearMessage !== null) root.clearTimeout(clearMessage);
      clearMessage = root.setTimeout(function () {
        clearMessage = null;
        if (!dead) renderer.setRefreshState({ message: '' });
      }, 6000);
    }
    async function loadCache() {
      var revision = ++loadRevision;
      var profile = await repository.getProfile();
      if (dead || revision !== loadRevision) return;
      renderer.setProfile(profile, {});
      var images = await repository.getImages(profile);
      if (dead || revision !== loadRevision) return;
      renderer.setProfile(profile, images);
      bridge.card.saveSnapshot({ profile: profile, images: images });
    }
    async function refresh() {
      if (dead || busy) return;
      busy = true;
      renderer.setRefreshState({ busy: true, message: '' });
      try {
        await repository.refreshPublic();
        if (dead) return;
        await loadCache();
        message('公开资料已刷新');
      } catch (error) {
        if (!dead) message(error.message || '刷新失败');
      } finally {
        busy = false;
        if (!dead) renderer.setRefreshState({ busy: false });
      }
    }
    var detach = root.MaiPullRefresh.attach(canvas, {
      size: renderer.size,
      canRefresh: function () { return !dead && !busy; },
      onPull: function (pull) { if (!dead) renderer.setRefreshState({ pull: pull }); },
      onRefresh: refresh
    });
    bridge.card.onRefresh(function () {
      if (!dead) loadCache().catch(function (error) { message(error.message || '读取资料失败'); });
    });
    bridge.config.onChange(function () {
      if (dead) return;
      loadCache().catch(function (error) { message(error.message || '读取配置失败'); });
    });
    function dispose() {
      dead = true; ++loadRevision;
      if (clearMessage !== null) root.clearTimeout(clearMessage);
      detach(); renderer.dispose();
    }
    root.__maiCardDispose = dispose;
    // AOD recovery rebuilds the runtime and only latches the first frames; draw the
    // last known profile synchronously before any bridge round trip.
    var snapshot = bridge.card.readSnapshot();
    if (snapshot && snapshot.profile) renderer.setProfile(snapshot.profile, snapshot.images || {});
    loadCache().catch(function (error) { message(error.message || '读取资料失败'); });
    return { dispose: dispose, refresh: refresh };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { start: start };
  else start(root.document.getElementById('rear'), root.bridge);
})(typeof window !== 'undefined' ? window : globalThis);
