// Test driver: launches the real app with a fake microphone and drives its real
// UI over the DevTools protocol. Requires the Vite dev server on 5174.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeClickTrack } from './make-clicktrack.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchApp({ port = 9223, bpm = 120 } = {}) {
  const require = createRequire(import.meta.url);
  const electron = require('electron');

  const wav = path.join(os.tmpdir(), `beatsync-click-${bpm}.wav`);
  fs.writeFileSync(wav, makeClickTrack({ bpm }));

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  // Isolate the profile. Sharing the real one means a test run overwrites the
  // operator's saved OSC host, port and input device through localStorage.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'beatsync-test-'));

  const child = spawn(electron, [
    '.',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
  ], { env, stdio: ['ignore', 'pipe', 'pipe'] });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('5174'));
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(500);
  }
  if (!wsUrl) {
    try { child.kill(); } catch {}
    throw new Error('DevTools target never appeared (is Vite running on 5174?)');
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const cmd = (method, params = {}) => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((r) => waiting.set(id, r));
  };

  async function evaluate(expression) {
    const r = await cmd('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.text + ' :: ' + expression);
    }
    return r.result?.result?.value;
  }

  await cmd('Runtime.enable');
  await sleep(1500); // let Svelte mount

  const clickButton = (text) => evaluate(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => x.textContent.trim() === ${JSON.stringify(text)});
    if (!b) return 'NOT_FOUND';
    if (b.disabled) return 'DISABLED';
    b.click();
    return 'OK';
  })()`);

  // Matches on a prefix, for buttons whose label changes with state.
  const clickButtonStartingWith = (prefix) => evaluate(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => x.textContent.trim().startsWith(${JSON.stringify(prefix)}));
    if (!b) return 'NOT_FOUND';
    if (b.disabled) return 'DISABLED';
    b.click();
    return 'OK';
  })()`);

  // Svelte's bind:value listens for input events, so set through the native
  // setter and dispatch one.
  const setInput = (id, value) => evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return 'NOT_FOUND';
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set
      .call(el, String(${JSON.stringify(value)}));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`);

  // Switch between Perform / Setup / Activity the way an operator would.
  const goto = async (label) => {
    const r = await clickButton(label);
    if (r !== 'OK') throw new Error(`could not open the ${label} tab: ${r}`);
    await sleep(350);
    return r;
  };

  // Stable hooks, so a restyle does not break the tests.
  const readBpm = () => evaluate(
    `(document.querySelector('[data-testid=bpm-value]')?.textContent || '').trim()`);
  const readStatus = () => evaluate(
    `(document.querySelector('[data-testid=lock-status]')?.textContent || '').trim()`);

  // Waits for a STABLE lock, not the first one. The first reading off a freshly
  // filled window is often a metrical relative that the clock then corrects;
  // reporting that number measures the wrong thing.
  async function waitForLock(label, timeoutMs = 30000, holds = 3) {
    await goto('Perform');
    const started = Date.now();
    let last = '';
    let held = 0;
    let heldBpm = 0;
    while (Date.now() - started < timeoutMs) {
      const txt = await readBpm();
      last = txt;
      const n = parseFloat(txt);
      if (Number.isFinite(n) && n > 0 && (await readStatus()).includes('locked')) {
        held = heldBpm && Math.abs(n - heldBpm) < 1.5 ? held + 1 : 1;
        heldBpm = n;
        if (held >= holds) {
          const secs = ((Date.now() - started) / 1000).toFixed(1);
          console.log(`  ${label}: settled at ${n} BPM after ${secs}s`);
          return n;
        }
      } else {
        held = 0;
      }
      await sleep(700);
    }
    throw new Error(`${label}: no stable lock within ${timeoutMs / 1000}s (showed "${last}")`);
  }

  const close = () => { try { child.kill(); } catch {} };

  return {
    child, cmd, evaluate, clickButton, clickButtonStartingWith, setInput, goto,
    readBpm, readStatus, waitForLock, close,
  };
}
