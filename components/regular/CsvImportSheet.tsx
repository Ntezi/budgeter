import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { AppSheet } from '@/components/patterns/AppSheet';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { importRecurringCsv, recurringCsvHeader } from '@/lib/repo/recurring';

/** Repeats CSV import (same parser and writes as before BUDG-8); S15 links it from Settings › Import. */
export function CsvImportSheet({ uid, open, onClose, onImported }: { uid: string | null; open: boolean; onClose: () => void; onImported: (count: number) => void }) {
  const [csvText, setCsvText] = useState(recurringCsvHeader);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    if (!uid || busy) return;
    setBusy(true);
    setError('');
    try {
      const count = await importRecurringCsv(uid, csvText);
      setCsvText(recurringCsvHeader);
      onImported(count);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppSheet
      open={open}
      onClose={onClose}
      title="Import repeats from a file"
      testID="csv-import-sheet"
      footer={<AppButton label={busy ? 'Importing…' : 'Import repeats'} size="touch-lg" className="w-full" disabled={busy} onPress={run} />}
    >
      <View className="gap-4">
        <Text className="text-sm text-muted-foreground dark:text-zinc-400">Paste CSV rows under the header line. Each row becomes a new repeat.</Text>
        <Text className="text-sm text-foreground dark:text-zinc-50" selectable>{`Header: ${recurringCsvHeader}`}</Text>
        <FormField label="CSV">
          <AppInput accessibilityLabel="CSV rows" value={csvText} onChangeText={setCsvText} multiline numberOfLines={8} className="h-40 items-start py-2" autoCapitalize="none" />
        </FormField>
        {error ? <Text role="alert" className="text-sm text-destructive dark:text-red-300">{error}</Text> : null}
      </View>
    </AppSheet>
  );
}
