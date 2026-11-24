import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const WEB = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Sheet behaviour (BUDG-8 00 "Keyboard, focus, Back") for a sheet whose open state is a plain
 * boolean: on web, Escape closes it from anywhere (a focused field included), browser Back closes
 * it before leaving the route, and focus returns to the control that opened it.
 * Same rules as patterns/AppSheet useSheet, for screens that keep their own open state.
 */
export function useSheetEffects(open: boolean, close: () => void, opener?: { current: HTMLElement | null }) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!WEB || !open) return;
    const active = document.activeElement as HTMLElement | null;
    // An explicit opener wins: a sheet opened from inside another sheet returns focus to the control that
    // opened the first one, because its own button is gone with that sheet.
    const trigger = opener?.current ?? (active && active !== document.body ? active : null);
    window.history.pushState(window.history.state, '', window.location.href);
    let pushed = true;
    const onPop = () => {
      if (!pushed) return;
      pushed = false;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey, true);
      if (pushed) window.history.back(); // closed by a button: drop our history entry
      // The modal keeps focus trapped until its close animation ends, so retry until focus lands.
      let tries = 0;
      const tick = () => {
        if (!trigger || !document.contains(trigger) || document.activeElement === trigger || tries++ > 20) return;
        trigger.focus();
        setTimeout(tick, 50);
      };
      setTimeout(tick, 0);
    };
  }, [open]);
}

/**
 * Run `next` once the history entry of a sheet that is closing has been popped (its Back cleanup calls
 * history.back(), which lands asynchronously). Opening a second sheet in the same render would push its
 * own entry first and the late popstate would close it at once. Falls back to a timer off web or when no
 * popstate arrives.
 */
export function afterSheetHistory(next: () => void) {
  if (!WEB) {
    next();
    return;
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', run);
    setTimeout(next, 0);
  };
  window.addEventListener('popstate', run);
  setTimeout(run, 600);
}
