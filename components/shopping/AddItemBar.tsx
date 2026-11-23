import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';

export type Suggestion = { id: string; name: string; sub?: string };

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  /** Household only: catalog typeahead; a tap adds the item at once (BUDG-4 AC-2). */
  suggestions?: Suggestion[];
  onPick?: (id: string) => void;
  /** Shown as `Add "<text>"` when the text is not already a catalog name. */
  offerNew?: boolean;
  error?: string;
};

/** "Add item…" field at the top of a list, with the catalog suggestions right under it. */
export function AddItemBar({ value, onChangeText, onSubmit, suggestions, onPick, offerNew, error }: Props) {
  const typed = value.trim();
  const showMenu = typed.length > 0 && Boolean(suggestions);
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <AppInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Add item..."
          accessibilityLabel="Add item"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          className="h-12 min-w-0 flex-1 text-base"
        />
        <AppButton label="Add" size="touch-lg" className="px-5" textClassName="text-base" disabled={!typed} onPress={onSubmit} />
      </View>
      {showMenu ? (
        <View className="overflow-hidden rounded-xl border border-border bg-card dark:border-zinc-800 dark:bg-zinc-900" accessibilityRole="list">
          {suggestions!.map((s, i) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${s.name}${s.sub ? `, ${s.sub}` : ''}`}
              onPress={() => onPick?.(s.id)}
              className={`min-h-14 justify-center px-4 py-2 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60 ${i > 0 ? 'border-t border-border dark:border-zinc-800' : ''}`}
            >
              <Text className="text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{s.name}</Text>
              {s.sub ? <Text className="text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={1} testID="price-chip-suggestion">{s.sub}</Text> : null}
            </Pressable>
          ))}
          {offerNew ? (
            <Pressable
              accessibilityRole="button"
              onPress={onSubmit}
              className={`min-h-14 justify-center px-4 py-2 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60 ${suggestions!.length ? 'border-t border-border dark:border-zinc-800' : ''}`}
            >
              <Text className="text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{`Add "${typed}"`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
    </View>
  );
}
