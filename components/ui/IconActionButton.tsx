import React from 'react';
import { Platform, Pressable, Text, View, type PressableProps } from 'react-native';
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
  onPress,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [showTooltip, setShowTooltip] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handlePress(event: any) {
    if (!onPress) return;
    const result = onPress(event);
    if (icon !== 'content-save-outline') return;
    try {
      await Promise.resolve(result as any);
      if (timerRef.current) clearTimeout(timerRef.current);
      setSavedFlash(true);
      timerRef.current = setTimeout(() => setSavedFlash(false), 1400);
    } catch {
      // Keep silent here; calling screen handles error UI.
    }
  }

  const resolvedIcon: IconName = savedFlash ? 'check-circle-outline' : icon;
  const resolvedColor = savedFlash ? '#16A34A' : VARIANT_COLOR[variant];

  return (
    <View className="relative items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        {...({ title: label } as any)}
        className={cn(
          'h-8 w-8 items-center justify-center rounded-md border active:opacity-80',
          VARIANT_CLASS[variant],
          savedFlash && 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30',
          disabled && 'opacity-50',
          className
        )}
        disabled={disabled}
        onPress={handlePress}
        onHoverIn={(event) => {
          if (Platform.OS === 'web') setShowTooltip(true);
          onHoverIn?.(event);
        }}
        onHoverOut={(event) => {
          if (Platform.OS === 'web') setShowTooltip(false);
          onHoverOut?.(event);
        }}
        onFocus={(event) => {
          if (Platform.OS === 'web') setShowTooltip(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          if (Platform.OS === 'web') setShowTooltip(false);
          onBlur?.(event);
        }}
        {...props}
      >
        <MaterialCommunityIcons name={resolvedIcon} size={iconSize} color={resolvedColor} />
      </Pressable>
      {Platform.OS === 'web' && showTooltip ? (
        <View className="pointer-events-none absolute -top-7 z-50 rounded-md bg-zinc-700/85 px-2 py-1">
          <Text className="text-[11px] text-zinc-100" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
