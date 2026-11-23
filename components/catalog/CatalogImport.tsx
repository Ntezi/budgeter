import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { importShoppingCatalogCsv, parseShoppingCatalogCsv, shoppingCatalogCsvHeader } from '@/lib/repo/shopping';

/**
 * Catalog CSV import, the one place for it (BUDG-8 09 + 12): used by Catalog › Manage and by
 * Settings › Import (Catalog items). Preview parses with the importer's own parser
 * (parseShoppingCatalogCsv); nothing is written until "Import N rows", which calls the same
 * importShoppingCatalogCsv as before, so the stored catalog shape is unchanged.
 */
export function CatalogImport({ uid, onImported }: { uid: string | null; onImported?: (count: number) => void }) {
  const empty = `${shoppingCatalogCsvHeader}\n`;
  const [csvText, setCsvText] = useState(empty);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  function edit(text: string) {
    setCsvText(text);
    setPreview(null); // a changed file needs a new preview before anything can be written
    setError('');
    setDone('');
  }

  function runPreview() {
    setDone('');
    try {
      const names = parseShoppingCatalogCsv(csvText).map((r) => r.name);
      setError(names.length ? '' : 'No rows under the header line.');
      setPreview(names.length ? names : null);
    } catch (e: unknown) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runImport() {
    if (!uid || !preview?.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const count = await importShoppingCatalogCsv(uid, csvText);
      setDone(`${count} catalog item${count === 1 ? '' : 's'} imported.`);
      setPreview(null);
      setCsvText(empty);
      onImported?.(count);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e) || 'CSV import failed.');
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

  const n = preview?.length ?? 0;
  return (
    <View className="gap-3" testID="catalog-import">
      <Text className="text-sm text-muted-foreground dark:text-zinc-400" selectable>{`Columns: ${shoppingCatalogCsvHeader}. Quantity and price are not imported.`}</Text>
      {Platform.OS === 'web' ? <AppButton label="Choose a .csv file" variant="outline" size="touch" className="self-start" onPress={chooseFile} /> : null}
      <AppInput
        value={csvText}
        onChangeText={edit}
        multiline
        numberOfLines={6}
        accessibilityLabel="CSV text"
        className="items-start py-2 text-base"
        style={{ height: 144 }}
        autoCapitalize="none"
      />
      {error ? <Text role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</Text> : null}
      {done ? <Text accessibilityLiveRegion="polite" className="text-sm text-emerald-600 dark:text-emerald-300">{done}</Text> : null}
      {preview ? (
        <View testID="csv-preview" className="gap-1 rounded-xl border border-border bg-card p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50">{`${n} row${n === 1 ? '' : 's'} will be imported`}</Text>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400" numberOfLines={3}>{preview.slice(0, 8).join(', ')}{n > 8 ? ', …' : ''}</Text>
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <AppButton label="Preview" variant="outline" size="touch" onPress={runPreview} />
        <AppButton label={busy ? 'Importing…' : `Import ${n} row${n === 1 ? '' : 's'}`} size="touch" disabled={busy || !uid || !n} onPress={() => void runImport()} />
      </View>
    </View>
  );
}
