#!/usr/bin/env node
// npm run web:emulators — the one command for the local test environment:
// docker check -> emulators up (127.0.0.1) -> synthetic seed -> expo web with
// .env.emulator and EXPO_NO_DOTENV=1 (the production .env is never read).
// Flags: --no-web (emulators + seed only), --no-seed, --down (stop this lane's containers).
// BUDGETA_EMULATOR_PORT_OFFSET shifts every host port and the compose project (env.mjs).
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { root, childEnv } from './env.mjs';

const args = new Set(process.argv.slice(2));
const run = (cmd, argv, opts = {}) => {
  const res = spawnSync(cmd, argv, { cwd: root, stdio: 'inherit', ...opts });
  if (res.status !== 0) {
    console.error(`[web:emulators] ${cmd} ${argv.join(' ')} failed`);
    process.exit(res.status ?? 1);
  }
};

const env = childEnv();
const compose = ['compose', '-p', env.COMPOSE_PROJECT_NAME, '-f', 'docker-compose.emulators.yml'];
if (process.env.BUDGETA_EMULATOR_DOCKER_NETWORK === 'bridge') compose.push('-f', 'docker-compose.emulators.bridge.yml');
if (args.has('--down')) {
  run('docker', [...compose, 'down'], { env });
  process.exit(0);
}
if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error('[web:emulators] Docker is not running. Start Docker Desktop and retry.');
  process.exit(1);
}
console.log(`[web:emulators] starting Firebase emulators (project demo-budgeta, 127.0.0.1 only, auth ${env.BUDGETA_EMU_AUTH_PORT}, firestore ${env.BUDGETA_EMU_FIRESTORE_PORT}, compose ${env.COMPOSE_PROJECT_NAME})`);
run('docker', [...compose, 'up', '-d', '--build', '--wait'], { env });
if (!args.has('--no-seed')) run(process.execPath, [path.join('scripts', 'emulators', 'seed.mjs')], { env });
if (args.has('--no-web')) process.exit(0);

console.log('[web:emulators] starting Expo web against the emulators (EXPO_NO_DOTENV=1, cache cleared)');
const expo = spawn('npx', ['expo', 'start', '--web', '--clear', '--port', env.EXPO_WEB_PORT || '8081'], { cwd: root, env, stdio: 'inherit' });
expo.on('exit', (code) => process.exit(code ?? 0));
