import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const WEB = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Sheet behaviour (BUDG-8 00 "Keyboard, focus, Back") for a sheet whose open state is a plain
 * boolean: on web, Escape closes it from anywhere (a focused field included), browser Back closes
 * it before leaving the route, and focus returns to the control that opened it.
 * Same rules as patterns/AppSheet useSheet, for screens that keep their own open state.
 */
export function useSheetEffects(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!WEB || !open) return;
    const active = document.activeElement as HTMLElement | null;
    const trigger = active && active !== document.body ? active : null;
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
