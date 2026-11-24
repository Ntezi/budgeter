import { useWindowDimensions } from 'react-native';
import { BREAKPOINT_SIDEBAR } from './nav';

/**
 * BUDG-41 density rule (one place): from the desktop breakpoint (1024 px, the same one that shows the
 * sidebar) controls are 36 px like the old app (AppButton md, inputs h-9) and rows use the old padding;
 * below it every interactive target stays at least 44 px. Text sizes never change with the width.
 */
export const CONTROL_HEIGHT_DESKTOP = 36;
export const CONTROL_HEIGHT_TOUCH = 44;

export function isDenseWidth(width: number): boolean {
  return width >= BREAKPOINT_SIDEBAR;
}

/** true from 1024 px: compact controls and rows. */
export function useDense(): boolean {
  const { width } = useWindowDimensions();
  return isDenseWidth(width);
}

/** Height of a button, input or toggle: 36 px from 1024 px, 44 px below. */
export function useControlHeight(): number {
  return useDense() ? CONTROL_HEIGHT_DESKTOP : CONTROL_HEIGHT_TOUCH;
}
