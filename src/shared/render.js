/* Shared Canvas renderer. All paints, including image callbacks, run in RAF. */
(function (root) {
  'use strict';
  var tiers = [1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 14500, 15000];
  function ratingTier(rating) {
    for (var i = 0; i < tiers.length; i++) if (rating < tiers[i]) return i + 1;
    return 11;
  }
  function create(canvas, options) {
    options = options || {};
    var ctx = canvas.getContext('2d');
    var W = root.CANVAS_W || canvas.width || 912;
    var H = root.CANVAS_H || canvas.height || 596;
    var assetBase = options.assetBase || 'assets/';
    var profile = {}, images = {}, sources = {}, pending = {}, dead = false, frame = null;
    var refresh = { pull: 0, busy: false, message: '' };
    function requestDraw() {
      if (dead || frame !== null) return;
      frame = root.requestAnimationFrame(function () { frame = null; if (!dead) draw(); });
    }
    function image(key, source) {
      if (sources[key] === source) return;
      sources[key] = source;
      delete images[key];
      if (pending[key]) pending[key].onload = pending[key].onerror = null;
      delete pending[key];
      if (!source) return;
      var item = new root.Image();
      pending[key] = item;
      item.onload = function () {
        if (dead || pending[key] !== item) return;
        images[key] = item;
        delete pending[key];
        requestDraw();
      };
      item.onerror = function () {
        if (dead || pending[key] !== item) return;
        delete pending[key];
        requestDraw();
      };
      item.src = source;
    }
    function round(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function textFit(value, size, x, y, width, color) {
      var text = String(value);
      ctx.font = '600 ' + size + 'px sans-serif';
      while (size > 12 && ctx.measureText(text).width > width) {
        size--; ctx.font = '600 ' + size + 'px sans-serif';
      }
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
    function drawRating() {
      var x = 511, y = 260, scale = 350 / 664;
      if (images.rating) ctx.drawImage(images.rating, x, y, 350, 130 * scale);
      var digits = String(Math.max(0, Math.floor(profile.rating || 0))).padStart(5, '0');
      if (!images.rating || digits.length > 5) {
        ctx.textAlign = 'left';
        textFit('Rating ' + (profile.rating || 0), 32, 512, 290, 342, '#252233');
        return;
      }
      for (var i = 0; i < 5; i++) {
        var digit = images['d' + digits[i]];
        if (digit) ctx.drawImage(digit, x + (85 * 664 / 186 + i * 15 * 664 / 186) * scale,
          y + (8 * 130 / 35) * scale, 17 * 664 / 186 * scale, 20 * 130 / 35 * scale);
      }
    }
    function draw() {
      ctx.save();
      if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#f5f3f7'; ctx.fillRect(0, 0, W, H);
      if (images.frame) {
        var bgScale = Math.max(W / images.frame.width, H / images.frame.height);
        var bw = images.frame.width * bgScale, bh = images.frame.height * bgScale;
        ctx.drawImage(images.frame, W * 604 / 912 - bw / 2, (H - bh) / 2, bw, bh);
      }
      var fit = Math.min(W / 912, H / 596);
      ctx.translate(W - 912 * fit, (H - 596 * fit) / 2); ctx.scale(fit, fit);
      ctx.save(); ctx.translate(0, refresh.pull * 0.35);
      if (images.plate) ctx.drawImage(images.plate, 320, 44, 568, 568 * images.plate.height / images.plate.width);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; round(320, 169, 568, 190, 17); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1; ctx.stroke();
      if (images.icon) {
        ctx.save(); round(343, 191, 146, 146, 11); ctx.clip();
        ctx.drawImage(images.icon, 343, 191, 146, 146); ctx.restore();
      }
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      var hasProfile = !!(profile.name || profile.publicUpdatedAt || profile.fullUpdatedAt);
      textFit(profile.name || '舞萌背屏', 38, 512, 220, 342, '#252233');
      if (hasProfile) drawRating();
      else textFit('尚未配置账号', 24, 512, 290, 342, '#625b70');
      if (profile.title) {
        if (images.title) ctx.drawImage(images.title, 320, 381, 568, 53);
        ctx.textAlign = 'center'; textFit(profile.title, 23, 604, 407, 530, '#28272d');
      }
      if (profile.fullUpdatedAt) {
        var bx = 512;
        if (images.course && profile.courseRank) { ctx.drawImage(images.course, bx, 444, 112, 45); bx += 128; }
        if (images.class && profile.classRank) ctx.drawImage(images.class, bx, 435, 92, 55);
      }
      ctx.restore();
      var status = refresh.busy ? (refresh.message || '正在刷新公开资料…') : refresh.message;
      if (refresh.pull > 0) status = refresh.pull >= 64 ? '松手刷新 · 免费' : '下拉刷新 · 免费';
      if (status) {
        ctx.fillStyle = 'rgba(255,255,255,.94)'; round(352, 518, 504, 48, 16); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        textFit(status, 22, 604, 542, 470, '#51456b');
      }
      ctx.restore();
    }
    function setProfile(value, dynamicImages) {
      profile = value || {};
      dynamicImages = dynamicImages || {};
      var color = String(profile.titleColor || 'normal').toLowerCase();
      if (['normal', 'bronze', 'silver', 'gold', 'rainbow'].indexOf(color) < 0) color = 'normal';
      image('rating', assetBase + 'rating-' + String(ratingTier(profile.rating || 0)).padStart(2, '0') + '.png');
      image('title', assetBase + 'title-' + color + '.png');
      ['icon', 'plate', 'frame', 'course', 'class'].forEach(function (key) { image(key, dynamicImages[key]); });
      requestDraw();
    }
    function dispose() {
      dead = true;
      if (frame !== null) root.cancelAnimationFrame(frame);
      Object.keys(pending).forEach(function (key) { pending[key].onload = pending[key].onerror = null; });
    }
    for (var i = 0; i < 10; i++) image('d' + i, assetBase + 'digit-' + i + '.png');
    setProfile({});
    return {
      setProfile: setProfile,
      setRefreshState: function (value) {
        Object.keys(value).forEach(function (key) { refresh[key] = value[key]; }); requestDraw();
      },
      requestDraw: requestDraw,
      dispose: dispose,
      size: { width: W, height: H }
    };
  }
  root.MaiRenderer = { create: create, ratingTier: ratingTier };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MaiRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
