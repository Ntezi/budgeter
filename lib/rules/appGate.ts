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
 * onboarding "Plan <Month>". In-app paths only: no //host, no scheme, not /auth or /onboarding.
 */
export function nextFromLocation(location: string): string | null {
  const q = location.indexOf('?');
  const path = q < 0 ? location : location.slice(0, q);
  if (q < 0 || !(path.startsWith('/auth') || path.startsWith('/onboarding'))) return null;
  let next: string | null = null;
  try {
    next = new URLSearchParams(location.slice(q + 1)).get('next');
  } catch {
    return null;
  }
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (next.startsWith('/auth') || next.startsWith('/onboarding')) return null;
  return next;
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
