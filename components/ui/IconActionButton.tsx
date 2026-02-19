import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type IconActionVariant = 'default' | 'danger' | 'muted';

type Props = Omit<PressableProps, 'children'> & {
  icon: IconName;
  label: string;
  variant?: IconActionVariant;
  className?: string;
  iconSize?: number;
};

const VARIANT_CLASS: Record<IconActionVariant, string> = {
  default: 'border border-transparent bg-transparent',
  danger: 'border border-transparent bg-transparent',
  muted: 'border border-transparent bg-transparent',
};

const VARIANT_COLOR: Record<IconActionVariant, string> = {
  default: '#717182',
  danger: '#D4183D',
  muted: '#717182',
};

export function IconActionButton({
  icon,
  label,
  variant = 'default',
  className,
  iconSize = 18,
  disabled,
  ...props
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'h-8 w-8 items-center justify-center rounded-md border active:opacity-80',
        VARIANT_CLASS[variant],
        disabled && 'opacity-50',
        className
      )}
      disabled={disabled}
      {...props}
    >
      <MaterialCommunityIcons name={icon} size={iconSize} color={VARIANT_COLOR[variant]} />
    </Pressable>
  );
}
