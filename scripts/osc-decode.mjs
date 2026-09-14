// Independent OSC decoder used by the tests, deliberately not sharing code with
// the encoder it checks.

import assert from 'node:assert/strict';

export function decode(buf) {
  let o = 0;
  const readStr = () => {
    const end = buf.indexOf(0, o);
    const s = buf.toString('ascii', o, end);
    o = (end + 4) & ~3;
    return s;
  };
  const address = readStr();
  const tags = readStr();
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'f') { args.push({ type: 'f', value: buf.readFloatBE(o) }); o += 4; }
    else if (t === 'i') { args.push({ type: 'i', value: buf.readInt32BE(o) }); o += 4; }
    else if (t === 's') { args.push({ type: 's', value: readStr() }); }
  }
  assert.equal(o, buf.length, 'trailing bytes after decode');
  return { address, args };
}
