const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Both runtime bundles are deliberately classic scripts, not ES modules.
test('installable root contains an API 2 module and classic scripts for both runtimes', () => {
  const manifest = JSON.parse(fs.readFileSync('module.json', 'utf8'));
  assert.equal(manifest.id, 'dev.finall.maiprofile');
  assert.equal(manifest.apiVersion, 2);
  assert.ok(Number.isInteger(manifest.versionCode) && manifest.versionCode > 0);
  assert.deepEqual([...manifest.capabilities].sort(), ['files', 'network', 'storage']);
  for (const entry of ['card/main.js', 'webroot/main.js']) {
    new vm.Script(fs.readFileSync(entry, 'utf8'), { filename: entry });
  }
  const card = fs.readFileSync('card/index.html', 'utf8');
  assert.match(card, /<canvas\s[^>]*id="rear"/);
  const web = fs.readFileSync('webroot/index.html', 'utf8');
  const scripts = [...web.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(scripts[0], 'bridge-shim.js');
  assert.ok(scripts.includes('main.js'));
  assert.equal(fs.existsSync('webroot/bridge-shim.js'), false);
  for (const area of ['card', 'webroot']) {
    for (let tier = 1; tier <= 11; tier++) {
      assert.ok(fs.existsSync(area + '/assets/rating-' + String(tier).padStart(2, '0') + '.png'));
    }
  }
});
