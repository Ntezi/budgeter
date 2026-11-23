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

export function decideGate(s: GateInput): GateDecision {
  const isOnboarding = s.pathname.startsWith('/onboarding');
  const isAuth = s.pathname.startsWith('/auth');

  if (!s.onboardingComplete && !isOnboarding) return { replace: '/onboarding', pending: s.pending };

  if (s.onboardingComplete && !s.signedIn && !isAuth) {
    // Keep the deep link so the view is restored after sign-in.
    const pending = !isOnboarding && !isRoot(s.pathname) ? s.location : s.pending;
    return { replace: '/auth', pending };
  }

  if (s.onboardingComplete && s.signedIn) {
    if (isOnboarding || isAuth || isRoot(s.pathname)) {
      // Not cleared here: the replace may be dropped while the navigator mounts.
      return { replace: s.pending || s.firstShellRoute, pending: s.pending };
    }
    // On a shell route: keep the link while it is the one shown (the navigator may still
    // reset to "/"); once the user is elsewhere it has been honoured.
    return { replace: null, pending: s.location === s.pending ? s.pending : null };
  }

  return { replace: null, pending: s.pending };
}
