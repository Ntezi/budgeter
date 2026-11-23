import React from 'react';
import { Text, View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';

type Props = {
  open: boolean;
  onClose: () => void;
  chefUid: string;
  label: string;
  onChange: (patch: { chefUid?: string; label?: string }) => void;
  error?: string;
  busy: boolean;
  onShare: () => void;
};

/** Share with chef (BUDG-8 07, BUDG-4 pattern): chef account ID + label, one sentence on what they can see. */
export function ShareSheet({ open, onClose, chefUid, label, onChange, error, busy, onShare }: Props) {
  const footer = (
    <>
      {error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
      <AppButton label={busy ? 'Sharing…' : 'Share list'} size="touch-lg" className="w-full dark:bg-zinc-50" textClassName="text-base dark:text-zinc-900" disabled={busy || !chefUid.trim()} onPress={onShare} />
      <AppButton label="Cancel" variant="ghost" size="touch" disabled={busy} onPress={onClose} />
    </>
  );
  return (
    <AppSheet open={open} onClose={() => !busy && onClose()} title="Share with chef" footer={footer} testID="share-sheet">
      <View className="gap-4">
        <Text className="text-base text-foreground dark:text-zinc-50">
          They can add and tick items on this list only. They can&apos;t see prices, receipts, budgets or other lists.
        </Text>
        <FormField label="Chef's account ID">
          <AppInput
            autoFocus
            value={chefUid}
            onChangeText={(v) => onChange({ chefUid: v })}
            placeholder="From their Settings, Collaborator ID"
            autoCapitalize="none"
            accessibilityLabel="Chef account ID"
            className="h-11 text-base"
          />
        </FormField>
        <FormField label="Name to show">
          <AppInput value={label} onChangeText={(v) => onChange({ label: v })} placeholder="Chef" accessibilityLabel="Chef name" className="h-11 text-base" />
        </FormField>
      </View>
    </AppSheet>
  );
}

/** "Stop sharing" confirm: names who loses access and that items stay. */
export function StopSharingDialog({ open, label, busy, onClose, onConfirm }: { open: boolean; label: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <AppModal open={open} onClose={() => !busy && onClose()} title="Stop sharing?">
      <View className="gap-4">
        <Text className="text-base text-foreground dark:text-zinc-50">{`${label} loses access now. Items stay on your list.`}</Text>
        <View className="flex-row gap-2">
          <AppButton label="Keep sharing" variant="outline" size="touch" className="flex-1" disabled={busy} onPress={onClose} />
          <AppButton label={busy ? 'Stopping…' : 'Stop sharing'} variant="destructive" size="touch" className="flex-1" testID="confirm-stop-sharing" disabled={busy} onPress={onConfirm} />
        </View>
      </View>
    </AppModal>
  );
}
