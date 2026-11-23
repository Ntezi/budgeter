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

  const finish = useCallback(() => {
    setOpen(false);
    const after = afterRef.current;
    afterRef.current = null;
    const trigger = triggerRef.current;
    setTimeout(() => {
      if (WEB && trigger && document.contains(trigger)) trigger.focus();
      if (after) after();
    }, 0);
  }, []);

  const show = useCallback(() => {
    if (WEB) triggerRef.current = (document.activeElement as HTMLElement) || null;
    setOpen(true);
  }, []);

  const hide = useCallback(
    (after?: () => void) => {
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
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, finish]);

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
