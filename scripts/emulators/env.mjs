// Shared loader for .env.emulator plus the loopback/demo guard used by every
// emulator script. Refuses to run unless the target is a demo-* project on loopback.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PROJECT_ID = 'demo-budgeta';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
export const DEFAULT_PORTS = { auth: 9099, firestore: 8080, ui: 4000, web: 8081 };

/**
 * Optional BUDGETA_EMULATOR_PORT_OFFSET (integer 0..1000, default 0) shifts the
 * host ports (auth, firestore, UI, Expo web) and names a separate compose project,
 * so two worktrees can run side by side. Mirrors lib/emulatorPorts.ts.
 * The loopback and demo-project guards are unchanged.
 */
export function portOffset(raw = process.env.BUDGETA_EMULATOR_PORT_OFFSET) {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  if (!/^\d{1,4}$/.test(s) || Number(s) > 1000) throw new Error(`BUDGETA_EMULATOR_PORT_OFFSET must be an integer 0..1000, got "${s}"`);
  return Number(s);
}

export function emulatorPorts(raw) {
  const offset = portOffset(raw);
  return {
    offset,
    auth: DEFAULT_PORTS.auth + offset,
    firestore: DEFAULT_PORTS.firestore + offset,
    ui: DEFAULT_PORTS.ui + offset,
    web: DEFAULT_PORTS.web + offset,
    composeProject: offset ? `budgeta-emulators-o${offset}` : 'budgeta-emulators',
  };
}

export function readEmulatorEnv() {
  const text = fs.readFileSync(path.join(root, '.env.emulator'), 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  if (out.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== PROJECT_ID) throw new Error('emulator env: project must be demo-budgeta');
  if (!LOOPBACK.has(out.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST)) throw new Error('emulator env: host must be loopback');
  const ports = emulatorPorts();
  if (ports.offset) {
    out.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT = String(Number(out.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT) + ports.offset);
    out.EXPO_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT = String(Number(out.EXPO_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT) + ports.offset);
  }
  return out;
}

export function assertLoopback(hostPort, name) {
  const host = String(hostPort || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (!LOOPBACK.has(host)) throw new Error(`${name} must point at a loopback emulator, got "${hostPort}"`);
}

/** Child-process env: no inherited Firebase/Google settings, emulator values only, dotenv off. */
export function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('EXPO_PUBLIC_') || key.startsWith('GOOGLE_') || key.startsWith('FIREBASE_') || key === 'GCLOUD_PROJECT') delete env[key];
  }
  const emu = readEmulatorEnv();
  const ports = emulatorPorts();
  return {
    ...env,
    ...emu,
    BUDGETA_EMU_AUTH_PORT: String(ports.auth),
    BUDGETA_EMU_FIRESTORE_PORT: String(ports.firestore),
    BUDGETA_EMU_UI_PORT: String(ports.ui),
    COMPOSE_PROJECT_NAME: ports.composeProject,
    ...(ports.offset ? { EXPO_WEB_PORT: String(ports.web) } : {}),
    EXPO_NO_DOTENV: '1',
    GCLOUD_PROJECT: PROJECT_ID,
    FIRESTORE_EMULATOR_HOST: `${emu.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST}:${emu.EXPO_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT}`,
    FIREBASE_AUTH_EMULATOR_HOST: `${emu.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST}:${emu.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT}`,
    ...extra,
  };
}
