import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { FormField } from '@/components/patterns/FormLayout';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { importRecurringCsv, parseRecurringCsv, recurringCsvHeader, type Recurring } from '@/lib/repo/recurring';
import { Notice, RadioRow, SettingsPage, SettingsSection } from './SettingsParts';
import { CatalogImport } from '@/components/catalog/CatalogImport';

type Kind = 'regular' | 'catalog';
type Row = Omit<Recurring, 'id'>;

const GROUP: Record<string, string> = { NEED: 'Needs', WANT: 'Wants', SAVINGS: 'Savings' };

/**
 * Import from a file (09). Regular costs: paste or choose a CSV, Preview parses it with the same parser
 * (parseRecurringCsv), and only "Import N rows" writes, through the same importRecurringCsv as before.
 * Catalog items use components/catalog/CatalogImport, the same block Catalog › Manage shows.
 */
export function ImportPage({ uid, initialKind, onBack }: { uid: string | null; initialKind?: Kind; onBack: () => void }) {
  const [kind, setKind] = useState<Kind | null>(initialKind ?? null);
  const [csvText, setCsvText] = useState(recurringCsvHeader);
  const [preview, setPreview] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  function edit(text: string) {
    setCsvText(text);
    setPreview(null); // a changed file needs a new preview before anything can be written
    setError('');
  }

  function runPreview() {
    setDone('');
    try {
      const rows = parseRecurringCsv(csvText);
      setError(rows.length ? '' : 'No rows under the header line.');
      setPreview(rows.length ? rows : null);
    } catch (e: unknown) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runImport() {
    if (!uid || !preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const count = await importRecurringCsv(uid, csvText);
      setDone(`${count} regular cost${count === 1 ? '' : 's'} added.`);
      setPreview(null);
      setCsvText(recurringCsvHeader);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function chooseFile() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!/\.csv$/i.test(file.name)) {
        setPreview(null);
        setError('Choose a .csv file.');
        return;
      }
      edit(await file.text());
    };
    input.click();
  }

  return (
    <SettingsPage testID="settings-import" title="Import from a file" intro="Nothing is saved until you check the rows and press Import." onBack={onBack}>
      <SettingsSection title="What are you importing?">
        <RadioRow label="Regular costs" sub="Repeats: rent, school fees, subscriptions" checked={kind === 'regular'} onPress={() => setKind('regular')} />
        <RadioRow label="Catalog items" sub="Shopping items and their categories" checked={kind === 'catalog'} onPress={() => setKind('catalog')} />
      </SettingsSection>

      {kind === 'catalog' ? <CatalogImport uid={uid} /> : null}

      {kind === 'regular' ? (
        <View className="gap-4">
          <Text className="text-xs text-muted-foreground dark:text-zinc-400" selectable>{`First line must be: ${recurringCsvHeader}`}</Text>
          {Platform.OS === 'web' ? <AppButton label="Choose a .csv file" variant="outline" size="touch" className="self-start" onPress={chooseFile} /> : null}
          <FormField label="Or paste the rows">
            <AppInput accessibilityLabel="CSV rows" value={csvText} onChangeText={edit} multiline numberOfLines={6} className="items-start py-2" style={{ height: 144 }} autoCapitalize="none" />
          </FormField>
          <AppButton label="Preview" variant={preview ? 'outline' : 'primary'} size="touch" className="self-start" onPress={runPreview} />
          <Notice kind="error" text={error} />
          <Notice kind="ok" text={done} />
          {preview ? (
            <View className="gap-3">
              <SettingsSection title={`${preview.length} row${preview.length === 1 ? '' : 's'} to add`} testID="import-preview">
                {preview.map((row, i) => (
                  <View key={i} className="min-h-11 lg:min-h-9 flex-row flex-wrap items-center gap-x-3 px-4 py-2">
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{row.name}</Text>
                      <Text className="text-xs text-muted-foreground dark:text-zinc-400">
                        {[row.flow === 'INCOME' ? 'Income' : GROUP[row.group ?? ''] ?? row.group, `day ${row.dayOfMonth}`, row.active === false ? 'paused' : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-sm font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>{row.amount.toFixed(2)}</Text>
                      <Text className="text-sm text-emerald-600 dark:text-emerald-300">Will add</Text>
                    </View>
                  </View>
                ))}
              </SettingsSection>
              <Text className="text-xs text-muted-foreground dark:text-zinc-400">Each row becomes a new repeat. Existing repeats are not changed.</Text>
              <AppButton
                label={busy ? 'Importing…' : `Import ${preview.length} row${preview.length === 1 ? '' : 's'}`}
                size="touch-lg"
                className="w-full sm:w-auto sm:self-start"
                disabled={busy || !uid}
                onPress={runImport}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </SettingsPage>
  );
}
