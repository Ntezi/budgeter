// Port offset for running two local emulator lanes side by side (BUDG-4).
// Mirrors scripts/emulators/env.mjs. Pure: no Firebase import.
// BUDGETA_EMULATOR_PORT_OFFSET: integer 0..1000, default 0 (ports unchanged).
// Hosts stay loopback and the project stays demo-*; guards in lib/firebaseEmulator.ts still apply.
export const DEFAULT_EMULATOR_PORTS = { auth: 9099, firestore: 8080, ui: 4000, web: 8081 } as const;

export function emulatorPortOffset(raw?: string | null): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  if (!/^\d{1,4}$/.test(s) || Number(s) > 1000) {
    throw new Error(`BUDGETA_EMULATOR_PORT_OFFSET must be an integer 0..1000, got "${s}"`);
  }
  return Number(s);
}

export function emulatorPorts(raw: string | null | undefined = typeof process !== 'undefined' ? process.env.BUDGETA_EMULATOR_PORT_OFFSET : undefined) {
  const offset = emulatorPortOffset(raw);
  return {
    offset,
    auth: DEFAULT_EMULATOR_PORTS.auth + offset,
    firestore: DEFAULT_EMULATOR_PORTS.firestore + offset,
    ui: DEFAULT_EMULATOR_PORTS.ui + offset,
    web: DEFAULT_EMULATOR_PORTS.web + offset,
    composeProject: offset ? `budgeta-emulators-o${offset}` : 'budgeta-emulators',
  };
}
