// BUDG-8 01: "Plan <Month>" on onboarding step 3 must land on Plan with the New month sheet open after
// sign-in. Kept in memory only (no new storage): sign-in (Google popup or the emulator hook) does not
// reload the page. If the page reloads, the user simply lands on Home as before.
let planAfterSignIn = false;

export function rememberPlanAfterSignIn() {
  planAfterSignIn = true;
}

/** True once, then cleared. */
export function takePlanAfterSignIn() {
  const v = planAfterSignIn;
  planAfterSignIn = false;
  return v;
}
