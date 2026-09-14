// Minimal OSC 1.0 encoder.
//
// The `osc` npm package pulls in optional native serial-port bindings; Resolume
// only ever needs simple messages with float/int/string arguments, so we encode
// them directly and keep the main process dependency-free.

function padded(len) {
  return (len + 4) & ~3; // OSC pads every chunk to a 4-byte boundary
}

function writeString(str) {
  const bytes = Buffer.byteLength(str, 'ascii');
  const buf = Buffer.alloc(padded(bytes)); // zero-filled = null terminator + padding
  buf.write(str, 0, 'ascii');
  return buf;
}

/**
 * @param {string} address e.g. "/composition/layers/1/clips/1/connect"
 * @param {Array<{type:'f'|'i'|'s', value:number|string}>} args
 * @returns {Buffer}
 */
function encode(address, args = []) {
  if (typeof address !== 'string' || !address.startsWith('/')) {
    throw new Error(`Invalid OSC address: ${address}`);
  }

  const parts = [writeString(address)];
  let tags = ',';
  const payload = [];

  for (const arg of args) {
    const { type, value } = arg;
    switch (type) {
      case 'f': {
        const b = Buffer.alloc(4);
        b.writeFloatBE(Number(value), 0);
        payload.push(b);
        tags += 'f';
        break;
      }
      case 'i': {
        const b = Buffer.alloc(4);
        b.writeInt32BE(Math.trunc(Number(value)), 0);
        payload.push(b);
        tags += 'i';
        break;
      }
      case 's': {
        payload.push(writeString(String(value)));
        tags += 's';
        break;
      }
      default:
        throw new Error(`Unsupported OSC arg type: ${type}`);
    }
  }

  parts.push(writeString(tags));
  parts.push(...payload);
  return Buffer.concat(parts);
}

module.exports = { encode };
