// Runtime guard for the local test environment (BUDG-1 AC-1, ADR-2).
// Pure: no Firebase import, so node tests can exercise every throw.

export type FirebaseTargetEnv = {
  useEmulators?: string | null;
  projectId?: string | null;
  host?: string | null;
  authPort?: string | null;
  firestorePort?: string | null;
};

export type FirebaseTarget =
  | { useEmulators: false }
  | { useEmulators: true; host: string; authPort: number; firestorePort: number };

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(String(host || '').trim().toLowerCase());
}

function isOn(value?: string | null) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function port(value: string | null | undefined, fallback: number, name: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Firebase emulator guard: invalid ${name} "${raw}"`);
  }
  return parsed;
}

export function resolveFirebaseTarget(env: FirebaseTargetEnv): FirebaseTarget {
  const projectId = String(env.projectId ?? '').trim();
  const isDemoProject = projectId.startsWith('demo-');
  if (!isOn(env.useEmulators)) {
    if (isDemoProject) {
      throw new Error('Firebase emulator guard: demo-* project requires EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1');
    }
    return { useEmulators: false };
  }
  if (!isDemoProject) {
    throw new Error(`Firebase emulator guard: emulator mode only runs against a demo-* project, got "${projectId}"`);
  }
  const host = String(env.host ?? '127.0.0.1').trim() || '127.0.0.1';
  if (!isLoopbackHost(host)) {
    throw new Error(`Firebase emulator guard: emulator host must be loopback, got "${host}"`);
  }
  return {
    useEmulators: true,
    host: host === 'localhost' ? '127.0.0.1' : host,
    authPort: port(env.authPort, 9099, 'auth port'),
    firestorePort: port(env.firestorePort, 8080, 'firestore port'),
  };
}
