const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const fs = require('node:fs');
const request = require('../src/webui-network.js');

test('WebUI fetch sends headers/body directly and reads text, binary and HTTP errors', async t => {
  const calls = [];
  const image = Buffer.from([0, 128, 255, 1]);
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, authorization: req.headers.authorization, body });
    if (req.url === '/image') { res.end(image); return; }
    if (req.url === '/gateway-timeout') { res.writeHead(504); res.end('{"msg":"Gateway timeout"}'); return; }
    res.end('{"returnCode":1}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await request({ url: base + '/full', method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: '{"qrcode":"test-only"}', timeoutMs: 180000 });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).returnCode, 1);
  assert.deepEqual(calls[0], { method: 'POST', authorization: 'Bearer test-token', body: '{"qrcode":"test-only"}' });
  assert.equal((await request({ url: base + '/image', responseType: 'base64' })).bodyBase64, image.toString('base64'));
  assert.equal((await request({ url: base + '/gateway-timeout' })).status, 504);
  assert.equal(calls.length, 3); // A 504 must not cause an automatic retry.
});

test('WebUI request yields while pending, aborts at 180 seconds and never retries', async () => {
  let timeout, cleared = false, calls = 0, signal;
  const window = {
    AbortController,
    fetch(url, options) {
      calls++; signal = options.signal;
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    },
    setTimeout(fn, ms) { timeout = { fn, ms }; return 1; },
    clearTimeout(id) { cleared = id === 1; }
  };
  vm.runInNewContext(fs.readFileSync('src/webui-network.js', 'utf8'), { window });
  let settled = false;
  const pending = window.MaiWebRequest({ url: 'https://example.invalid/full', timeoutMs: 180000 });
  pending.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(signal.aborted, false);
  assert.equal(timeout.ms, 180000);
  timeout.fn();
  await assert.rejects(pending, error => error.code === 'TIMEOUT');
  assert.equal(calls, 1);
  assert.equal(cleared, true);
});
