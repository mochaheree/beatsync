// Launches Electron with a clean environment.
//
// If ELECTRON_RUN_AS_NODE is set anywhere in the shell (some tooling sets it),
// `electron .` silently runs the main script as plain Node instead of starting
// the app, and you get confusing module-loader errors instead of a window.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron'); // resolves to the executable path

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
