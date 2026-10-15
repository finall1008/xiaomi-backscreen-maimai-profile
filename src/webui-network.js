/* WebUI HTTP goes directly through WebView fetch, never through the native backend. */
(function (root) {
  'use strict';
  async function request(options) {
    var controller = new root.AbortController();
    var timeout = options.timeoutMs === undefined ? 15000 : options.timeoutMs;
    var timedOut = false;
    var timer = timeout > 0 ? root.setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, timeout) : null;
    try {
      var response = await root.fetch(options.url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        credentials: 'omit',
        signal: controller.signal
      });
      if (options.responseType === 'base64') {
        var bytes = new Uint8Array(await response.arrayBuffer());
        var chunks = [];
        for (var i = 0; i < bytes.length; i += 32768) {
          chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)));
        }
        return { status: response.status, bodyBase64: root.btoa(chunks.join('')) };
      }
      return { status: response.status, body: await response.text() };
    } catch (error) {
      var failure = new Error(timedOut ? '网络请求超时' : '网络请求失败');
      failure.code = timedOut ? 'TIMEOUT' : 'ERROR';
      throw failure;
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }
  root.MaiWebRequest = request;
  if (typeof module !== 'undefined' && module.exports) module.exports = request;
})(typeof window !== 'undefined' ? window : globalThis);
