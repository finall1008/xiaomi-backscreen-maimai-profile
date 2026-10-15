/* Pointer-only pull gesture. Coordinates are the same 912 x 596 units as the renderer. */
(function (root) {
  'use strict';
  function attach(canvas, options) {
    var active = null, rebound = null, disposed = false;
    var size = options.size || { width: 912, height: 596 };
    function point(event) {
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {};
      var width = rect.width || size.width, height = rect.height || size.height;
      var x = (event.clientX - (rect.left || 0)) * size.width / width;
      var y = (event.clientY - (rect.top || 0)) * size.height / height;
      var fit = Math.min(size.width / 912, size.height / 596);
      return { x: (x - (size.width - 912 * fit)) / fit, y: (y - (size.height - 596 * fit) / 2) / fit };
    }
    function inside(p) { return p.x >= 320 && p.x <= 888 && p.y >= 0 && p.y <= 596; }
    function stopRebound() {
      if (rebound !== null) root.cancelAnimationFrame(rebound);
      rebound = null;
    }
    function spring(from) {
      stopRebound();
      if (!from) { options.onPull(0); return; }
      var start = null;
      function tick(now) {
        if (disposed) return;
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / 150);
        options.onPull(from * Math.pow(1 - t, 3));
        rebound = t < 1 ? root.requestAnimationFrame(tick) : null;
      }
      rebound = root.requestAnimationFrame(tick);
    }
    function finish(allowRefresh) {
      if (!active) return;
      var gesture = active;
      active = null;
      if (gesture.captured && canvas.releasePointerCapture) {
        try { canvas.releasePointerCapture(gesture.id); } catch (_) { /* Already released by host. */ }
      }
      spring(gesture.pull);
      if (allowRefresh && gesture.direction === 'down' && gesture.pull >= 64 && options.canRefresh()) {
        options.onRefresh();
      }
    }
    function down(event) {
      if (active || event.isPrimary === false || (event.button !== undefined && event.button !== 0) || !options.canRefresh()) return;
      var p = point(event);
      if (!inside(p)) return;
      stopRebound(); options.onPull(0);
      active = { id: event.pointerId, x: p.x, y: p.y, pull: 0, direction: '', captured: false };
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); active.captured = true; } catch (_) { /* Optional host API. */ }
      }
    }
    function move(event) {
      if (!active || event.pointerId !== active.id) return;
      var p = point(event), dx = p.x - active.x, dy = p.y - active.y;
      if (!active.captured && !inside(p)) { finish(false); return; }
      if (!active.direction && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        active.direction = dy > 0 && Math.abs(dy) > Math.abs(dx) ? 'down' : 'ignore';
      }
      if (active.direction !== 'down') return;
      active.pull = Math.max(0, Math.min(96, dy * 0.5));
      options.onPull(active.pull);
      if (event.preventDefault) event.preventDefault();
    }
    function up(event) {
      if (!active || event.pointerId !== active.id) return;
      move(event);
      finish(true);
    }
    function cancel(event) { if (active && event.pointerId === active.id) finish(false); }
    function leave(event) { if (active && !active.captured) cancel(event); }
    var handlers = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel,
      lostpointercapture: cancel, pointerleave: leave };
    Object.keys(handlers).forEach(function (name) { canvas.addEventListener(name, handlers[name]); });
    return function () {
      disposed = true; stopRebound(); finish(false); stopRebound();
      Object.keys(handlers).forEach(function (name) { canvas.removeEventListener(name, handlers[name]); });
    };
  }
  root.MaiPullRefresh = { attach: attach };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MaiPullRefresh;
})(typeof window !== 'undefined' ? window : globalThis);
