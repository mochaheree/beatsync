const dgram = require('node:dgram');
const { encode } = require('./oscMessage.cjs');

let socket = null;
let target = null;

function connect(host, port) {
  return new Promise((resolve, reject) => {
    disconnect();
    const parsedPort = parseInt(port, 10);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      reject(new Error(`Invalid port: ${port}`));
      return;
    }

    const sock = dgram.createSocket('udp4');
    const onError = (err) => { try { sock.close(); } catch {} reject(err); };
    sock.once('error', onError);

    sock.bind(0, () => {
      sock.off('error', onError);
      sock.on('error', (err) => { console.error('[osc] socket error', err); });
      socket = sock;
      target = { host, port: parsedPort };
      resolve({ ok: true, host, port: parsedPort });
    });
  });
}

function disconnect() {
  if (socket) { try { socket.close(); } catch {} }
  socket = null;
  target = null;
  return { ok: true };
}

function status() {
  return { connected: !!socket, target };
}

// UDP is fire-and-forget: a successful send proves nothing about Resolume
// actually listening. The UI must not claim "connected to Resolume".
function send(address, args = []) {
  if (!socket) throw new Error('OSC port not open');
  const buf = encode(address, args);
  socket.send(buf, target.port, target.host);
  return { ok: true, bytes: buf.length };
}

const f = (value) => ({ type: 'f', value });

const playClip = (layer, clip) =>
  send(`/composition/layers/${layer}/clips/${clip}/connect`, [f(1)]);
const stopClip = (layer, clip) =>
  send(`/composition/layers/${layer}/clips/${clip}/connect`, [f(0)]);
// Resolume's tempo controller takes a NORMALISED 0..1 value, not a BPM.
// Sending a raw 128 gets clamped to 1.0 and lands at the top of the range
// (observed: sending 100 showed up as 500 BPM in Arena).
const TEMPO_RANGE = { min: 20, max: 500 };

function bpmToNormalised(bpm, range) {
  const min = Number(range && range.min);
  const max = Number(range && range.max);
  const lo = Number.isFinite(min) ? min : TEMPO_RANGE.min;
  const hi = Number.isFinite(max) ? max : TEMPO_RANGE.max;
  if (hi <= lo) throw new Error(`Invalid tempo range: ${lo}..${hi}`);
  const n = (Number(bpm) - lo) / (hi - lo);
  return Math.max(0, Math.min(1, n));
}

function setTempo(bpm, range) {
  const value = bpmToNormalised(bpm, range);
  send('/composition/tempocontroller/tempo', [f(value)]);
  return { ok: true, bpm: Number(bpm), normalised: value };
}

// Calibration escape hatch: push an exact 0..1 value and read what Arena shows.
function setTempoNormalised(value) {
  const v = Math.max(0, Math.min(1, Number(value)));
  send('/composition/tempocontroller/tempo', [f(v)]);
  return { ok: true, normalised: v };
}

const resync = () => send('/composition/tempocontroller/resync', [f(1)]);
const tempoTap = () => send('/composition/tempocontroller/tempotap', [f(1)]);

module.exports = {
  connect, disconnect, status, send,
  playClip, stopClip, setTempo, setTempoNormalised, resync, tempoTap,
  bpmToNormalised, TEMPO_RANGE,
};
