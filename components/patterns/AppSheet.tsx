import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';

const WEB = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Open state for one sheet (BUDG-8 00 "Keyboard, focus, Back, touch"):
 * - on web, opening adds a history entry so browser Back closes the sheet before leaving the route;
 * - closing (Escape, close button, backdrop, Back) returns focus to the control that opened it;
 * - hide(after) runs `after` only once the history entry is gone, so a navigation or ?month= change
 *   made from inside the sheet is never undone by the Back that removes the entry.
 */
export function useSheet() {
  const [open, setOpen] = useState(false);
  const pushedRef = useRef(false);
  const afterRef = useRef<null | (() => void)>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);

  const finish = useCallback(() => {
    closingRef.current = false;
    setOpen(false);
    const after = afterRef.current;
    afterRef.current = null;
    const trigger = triggerRef.current;
    // The modal keeps focus trapped until its close animation ends, so retry until focus lands.
    setTimeout(() => after?.(), 0);
    if (!WEB || !trigger) return;
    let tries = 0;
    const tick = () => {
      if (!document.contains(trigger) || document.activeElement === trigger || tries++ > 20) return;
      trigger.focus();
      setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  }, []);

  /** Pass the press event when you have it: on web a pressed div may not hold focus. */
  const show = useCallback((e?: unknown) => {
    if (WEB) {
      const active = document.activeElement as HTMLElement | null;
      const target = (e as { currentTarget?: unknown } | undefined)?.currentTarget;
      const fromEvent = target instanceof HTMLElement ? (target.closest('button, a, [role="button"], [tabindex]') as HTMLElement | null) : null;
      triggerRef.current = active && active !== document.body ? active : fromEvent;
    }
    setOpen(true);
  }, []);

  const hide = useCallback(
    (after?: () => void) => {
      if (closingRef.current) return; // Escape can arrive twice (our listener and the Modal's)
      closingRef.current = true;
      afterRef.current = after ?? null;
      if (WEB && pushedRef.current) {
        window.history.back(); // popstate below finishes the close
        return;
      }
      finish();
    },
    [finish]
  );

  useEffect(() => {
    if (!WEB || !open) return;
    window.history.pushState(window.history.state, '', window.location.href);
    pushedRef.current = true;
    const onPop = () => {
      if (!pushedRef.current) return;
      pushedRef.current = false;
      finish();
    };
    // Escape closes from anywhere in the sheet, a focused text field included.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideRef.current();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, finish]);

  const hideRef = useRef(() => hide());
  hideRef.current = () => hide();

  return { open, show, hide };
}

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
};

/** Bottom sheet on phone, centred dialog from 768 px; title row with a 44 px close; sticky footer. */
export function AppSheet({ open, onClose, title, children, footer, testID }: Props) {
  return (
    <AppModal presentation="sheet" open={open} onClose={onClose} title={title} footer={footer} testID={testID}>
      {children}
    </AppModal>
  );
}
