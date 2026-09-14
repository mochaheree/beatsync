// Round-trip check: encode a Resolume message, send it over UDP loopback,
// and decode the received bytes back independently.

import dgram from 'node:dgram';
import assert from 'node:assert/strict';
import { decode } from './osc-decode.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const osc = require('../src/main/osc.cjs');

const server = dgram.createSocket('udp4');
const received = [];
server.on('message', (msg) => received.push(decode(msg)));

await new Promise((r) => server.bind(0, '127.0.0.1', r));
const port = server.address().port;

await osc.connect('127.0.0.1', port);
osc.playClip(3, 7);
osc.stopClip(3, 7);
osc.setTempo(128.5, { min: 20, max: 500 });
osc.setTempo(1000, { min: 20, max: 500 });   // above range -> clamps to 1.0
osc.setTempo(-50, { min: 20, max: 500 });    // below range -> clamps to 0.0
osc.resync();
osc.send('/composition/layers/2/name', [{ type: 's', value: 'deck' }]);
osc.send('/test/int', [{ type: 'i', value: -42 }]);

await new Promise((r) => setTimeout(r, 150));
osc.disconnect();
server.close();

// Resolume's tempo parameter is normalised 0..1 over its own BPM range, so
// 128.5 BPM in a 20..500 range must go out as (128.5-20)/480 = 0.22604.
const expect = [
  ['/composition/layers/3/clips/7/connect', [{ type: 'f', value: 1 }]],
  ['/composition/layers/3/clips/7/connect', [{ type: 'f', value: 0 }]],
  ['/composition/tempocontroller/tempo', [{ type: 'f', value: (128.5 - 20) / 480 }]],
  ['/composition/tempocontroller/tempo', [{ type: 'f', value: 1 }]],
  ['/composition/tempocontroller/tempo', [{ type: 'f', value: 0 }]],
  ['/composition/tempocontroller/resync', [{ type: 'f', value: 1 }]],
  ['/composition/layers/2/name', [{ type: 's', value: 'deck' }]],
  ['/test/int', [{ type: 'i', value: -42 }]],
];

assert.equal(received.length, expect.length,
  `expected ${expect.length} datagrams, got ${received.length}`);

received.forEach((msg, i) => {
  const [addr, args] = expect[i];
  assert.equal(msg.address, addr);
  assert.equal(msg.args.length, args.length);
  msg.args.forEach((got, j) => {
    const want = args[j];
    assert.equal(got.type, want.type);
    if (want.type === 'f') {
      // float32 round-trip loses precision
      assert.ok(Math.abs(got.value - want.value) < 1e-6,
        `${addr} arg ${j}: got ${got.value}, want ${want.value}`);
    } else {
      assert.equal(got.value, want.value);
    }
  });
  console.log(`ok  ${addr}  ${JSON.stringify(msg.args.map((a) => a.value))}`);
});

// The BPM -> normalised map itself
assert.equal(osc.bpmToNormalised(20, { min: 20, max: 500 }), 0);
assert.equal(osc.bpmToNormalised(500, { min: 20, max: 500 }), 1);
assert.equal(osc.bpmToNormalised(260, { min: 20, max: 500 }), 0.5);
assert.equal(osc.bpmToNormalised(128, { min: 20, max: 500 }), (128 - 20) / 480);
assert.equal(osc.bpmToNormalised(128, { min: 60, max: 180 }), (128 - 60) / 120);
assert.equal(osc.bpmToNormalised(9999, { min: 20, max: 500 }), 1, 'must clamp high');
assert.equal(osc.bpmToNormalised(-1, { min: 20, max: 500 }), 0, 'must clamp low');
assert.throws(() => osc.bpmToNormalised(128, { min: 500, max: 20 }), /Invalid tempo range/);
console.log('ok  bpmToNormalised mapping + clamping');

// Sending with no open socket must fail loudly, not silently drop.
assert.throws(() => osc.send('/x', []), /not open/i);
console.log('ok  send without socket throws');

console.log(`\n${received.length + 1}/${received.length + 1} passed`);
