// BUDG-6 H-1: "Start my own budget" from the chef view. A per-viewer choice (kept in this browser), so a
// share from anyone can never keep a user out of their own budget. It creates nothing: the user lands on
// Plan with the New month sheet open and saves (or not) through the normal flow.
import { useEffect, useState } from 'react';

const KEY = 'budgeta:own-budget';
const chosen = new Set<string>();
const listeners = new Set<() => void>();
let routePending = false;

export function ownBudgetChosen(uid: string): boolean {
  if (!uid) return false;
  if (chosen.has(uid)) return true;
  try {
    return globalThis.localStorage?.getItem(KEY) === uid;
  } catch {
    return false;
  }
}

export function chooseOwnBudget(uid: string) {
  if (!uid) return;
  chosen.add(uid);
  try {
    globalThis.localStorage?.setItem(KEY, uid);
  } catch {}
  routePending = true;
  listeners.forEach((l) => l());
}

/** True once after chooseOwnBudget: the household shell then opens Plan with the New month sheet. */
export function takeOwnBudgetRoute(): boolean {
  const pending = routePending;
  routePending = false;
  return pending;
}

export function useOwnBudgetChosen(uid: string): boolean {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return ownBudgetChosen(uid);
}

export const OWN_BUDGET_ROUTE = '/budgets?new=1';
