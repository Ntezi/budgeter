import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ListGroup } from '@/components/patterns/ListRow';
import { EmptyState, LoadingState } from '@/components/patterns/States';
import { AppButton } from '@/components/ui/AppButton';
import { cn } from '@/lib/cn';

export type ListSummary = { id: string; name: string; count?: number; sharedWith?: string };
export type SharedSummary = { id: string; name: string };

type Props = {
  loading: boolean;
  lists: ListSummary[];
  shared: SharedSummary[];
  selectedId?: string;
  onOpen: (id: string) => void;
  onOpenShared: (id: string) => void;
  /** Household only (the chef gets just the shared list). */
  onNew?: () => void;
  onCatalog?: () => void;
};

function Row({ title, sub, active, onPress, shared }: { title: string; sub: string; active?: boolean; onPress: () => void; shared?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      aria-current={active ? 'page' : undefined}
      onPress={onPress}
      className={cn('min-h-14 flex-row items-center gap-3 px-4 py-2 hover:bg-muted/50 active:bg-muted dark:hover:bg-zinc-800/60', active && 'bg-muted dark:bg-zinc-800')}
    >
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-foreground dark:text-zinc-50" numberOfLines={1}>{title}</Text>
        <View className="flex-row items-center gap-1">
          {shared ? <MaterialCommunityIcons name="account-multiple-outline" size={14} color="#717182" /> : null}
          <Text className="min-w-0 shrink text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={1}>{sub}</Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" />
    </Pressable>
  );
}

/** Lists (BUDG-8 07): one card of list rows, "Shared with you" for the chef, New list + Catalog. */
export function ListsList({ loading, lists, shared, selectedId, onOpen, onOpenShared, onNew, onCatalog }: Props) {
  if (loading) return <LoadingState testID="lists-loading" />;
  const nothing = !lists.length && !shared.length;
  return (
    <View className="gap-6" testID="shopping-lists">
      {nothing && onNew ? <EmptyState icon="cart-outline" message="Make a list for your next shop." actionLabel="New list" onAction={onNew} testID="lists-empty" /> : null}
      {nothing && !onNew ? <EmptyState icon="cart-outline" message="No list is shared with you yet." testID="lists-empty" /> : null}
      {lists.length ? (
        <ListGroup title="Your lists">
          {lists.map((l) => (
            <Row
              key={l.id}
              title={l.name}
              active={l.id === selectedId}
              shared={Boolean(l.sharedWith)}
              sub={[l.count === undefined ? 'Counting…' : `${l.count} item${l.count === 1 ? '' : 's'}`, l.sharedWith ? `Shared · ${l.sharedWith}` : ''].filter(Boolean).join(' · ')}
              onPress={() => onOpen(l.id)}
            />
          ))}
        </ListGroup>
      ) : null}
      {shared.length ? (
        <ListGroup title="Shared with you">
          {shared.map((s) => (
            <Row key={s.id} title={s.name} sub="Shared by the household" shared active={s.id === selectedId} onPress={() => onOpenShared(s.id)} />
          ))}
        </ListGroup>
      ) : null}
      {onNew && !nothing ? (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <AppButton label="+ New list" size="touch" onPress={onNew} />
          {onCatalog ? <AppButton label="Catalog ›" variant="ghost" size="touch" onPress={onCatalog} /> : null}
        </View>
      ) : null}
    </View>
  );
}
