// BUDG-3: "Default account" for a reusable category or recurring template.
// Built from existing controls only. Changing it writes the source doc only:
// no allocation, no transaction, no other month (SEC-21).
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { DropdownField } from '@/components/ui/DropdownField';
import { watchAccounts, type Account } from '@/lib/repo/accounts';
import { APP_CURRENCY, setDefaultAccount } from '@/lib/repo/planLines';
import { accountIneligibility, repairReasonText } from '@/lib/rules/defaultAccount';

type Props = {
  uid: string;
  collectionName: 'expenses' | 'recurring';
  sourceId: string;
  value?: string;
};

export function DefaultAccountField({ uid, collectionName, sourceId, value }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  useEffect(() => (uid ? watchAccounts(uid, setAccounts, { includeArchived: true }) : undefined), [uid]);

  const current = String(value || '');
  const reason = current ? accountIneligibility(current, accounts, APP_CURRENCY) : null;
  const options = useMemo(
    () => [
      { label: 'No default', value: '' },
      ...accounts
        .filter((row): row is Account & { id: string } => Boolean(row.id) && !row.archived)
        .map((row) => ({ label: row.name, value: row.id })),
    ],
    [accounts]
  );

  async function onChange(next: string) {
    if (next === current) return;
    setError('');
    try {
      await setDefaultAccount(uid, collectionName, sourceId, next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View className="gap-1">
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">Default account</Text>
      <DropdownField value={reason ? '' : current} options={options} onChange={onChange} placeholder="No default" menuStrategy="inline" />
      <Text className="text-xs text-muted-foreground">Suggested for new lines in future months. Existing months stay as they are.</Text>
      {reason && accounts.length ? (
        <Text className="text-xs text-amber-700 dark:text-amber-300">{`${repairReasonText(reason)} · choose another or clear it`}</Text>
      ) : null}
      {error ? <Text className="text-xs text-red-600 dark:text-red-300">{error}</Text> : null}
    </View>
  );
}
