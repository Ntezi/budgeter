import React from 'react';
import { useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';

type Props = {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  /** Inside a sheet the primary action is always full width. */
  inSheet?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

/**
 * The one primary action of a screen or sheet (BUDG-8 design review C-3): full width and h-12 on a
 * phone (below 768 px) and inside sheets; compact (h-11, content width) in a desktop header.
 * Label: sentence case, verb + thing, no leading "+".
 */
export function PrimaryAction({ label, onPress, inSheet, disabled, testID, accessibilityLabel }: Props) {
  const { width } = useWindowDimensions();
  const block = inSheet || width < 768;
  return (
    <AppButton
      label={label}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      size={block ? 'touch-lg' : 'touch'}
      className={block ? 'w-full' : 'self-start'}
      onPress={onPress}
    />
  );
}
