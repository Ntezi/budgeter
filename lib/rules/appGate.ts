// Route decision of the root gate (app/_layout.tsx), kept pure so it can be unit tested.
//
// BUDG-6 fix: the deep link remembered on a web reload (e.g. /transactions?month=YYYY-MM)
// used to be cleared as soon as the gate *asked* for it. On web the navigator mounts after
// auth/workspace load, so that first router.replace can be dropped; the gate then ran again
// at "/" with nothing pending and sent the user to the first shell route (/shopping below
// 980 px). Clearing it on arrival is not enough either: the first gate run can already see
// the deep link before the navigator resets to "/". The pending link is now kept while the
// app shows it and cleared only once the user is on another shell route.

export type GateInput = {
  onboardingComplete: boolean;
  signedIn: boolean;
  pathname: string;
  /** pathname + search as the browser shows it. */
  location: string;
  pending: string | null;
  firstShellRoute: string;
};

export type GateDecision = { replace: string | null; pending: string | null };

const isRoot = (p: string) => p === '/' || p === '';

/**
 * BUDG-8 01: an intent carried as a URL on /auth or /onboarding (?next=/budgets?new=1), e.g.
 * onboarding "Plan <Month>". In-app paths only (BUDG-6): the value, decoded until stable, must be a plain
 * path with an optional simple query: no //host or /\host, no scheme anywhere (no ':' at all), no
 * backslash, whitespace or control character, no '..', not /auth or /onboarding. Anything else is
 * ignored, so the gate falls back to the default route.
 */
const SAFE_NEXT = /^\/(?!\/)[A-Za-z0-9\-_./]*(\?[A-Za-z0-9\-_.=&%]*)?$/;

export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  let decoded = next;
  for (let i = 0; i < 5; i += 1) {
    let step: string;
    try {
      step = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (step === decoded) break;
    decoded = step;
  }
  if (decoded !== decodeURIComponent(decoded)) return null; // still encoded after 5 rounds
  for (const v of [next, decoded]) {
    if (!SAFE_NEXT.test(v) || v.includes(':') || v.includes('..')) return null;
    if (/^\/(auth|onboarding)(\/|\?|$)/.test(v)) return null;
  }
  return next;
}

export function nextFromLocation(location: string): string | null {
  const q = location.indexOf('?');
  const path = q < 0 ? location : location.slice(0, q);
  if (q < 0 || !(path.startsWith('/auth') || path.startsWith('/onboarding'))) return null;
  try {
    return safeNext(new URLSearchParams(location.slice(q + 1)).get('next'));
  } catch {
    return null;
  }
}

/**
 * BUDG-6 S16: the location the gate decides on. Right after a router.replace the gate can run before
 * expo-router has written the new URL, so window.location still shows the previous screen (onboarding
 * "Plan <Month>" lost its ?next= that way). The browser URL is used only when it is on the same path;
 * otherwise the router's own ?next= param is.
 */
export function gateLocation(pathname: string, browser: string | null, next: string | null | undefined): string {
  if (browser != null && browser.split('?')[0] === pathname) return browser;
  return next ? `${pathname}?${new URLSearchParams({ next }).toString()}` : pathname;
}

export function decideGate(s: GateInput): GateDecision {
  const isOnboarding = s.pathname.startsWith('/onboarding');
  const isAuth = s.pathname.startsWith('/auth');
  // The ?next= intent becomes the pending link, so it survives the /auth -> /onboarding detour
  // (the gate can still read the old onboarding flag) and the replace that drops the query.
  const carried = s.pending ?? nextFromLocation(s.location);

  if (!s.onboardingComplete && !isOnboarding) return { replace: '/onboarding', pending: carried };

  if (s.onboardingComplete && !s.signedIn && !isAuth) {
    // Keep the deep link so the view is restored after sign-in.
    const pending = !isOnboarding && !isRoot(s.pathname) ? s.location : carried;
    return { replace: '/auth', pending };
  }

  if (s.onboardingComplete && s.signedIn) {
    if (isOnboarding || isAuth || isRoot(s.pathname)) {
      // Not cleared here: the replace may be dropped while the navigator mounts.
      return { replace: carried || s.firstShellRoute, pending: carried };
    }
    // On a shell route: keep the link while it is the one shown (the navigator may still
    // reset to "/"); once the user is elsewhere it has been honoured.
    return { replace: null, pending: s.location === s.pending ? s.pending : null };
  }

  return { replace: null, pending: s.pending };
}
