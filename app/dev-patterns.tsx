// Dev-only gallery of the BUDG-8 shared patterns (S1). Web + __DEV__ only; renders nothing in a
// production build. Route: /dev-patterns (10-build-order names it /__patterns; expo-router keeps
// underscore-prefixed names for layouts, so a plain name is used).
import React, { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { PageHeader } from '@/components/patterns/PageHeader';
import { SummaryCard } from '@/components/patterns/SummaryCard';
import { ListGroup, ListRow } from '@/components/patterns/ListRow';
import { AppSheet, useSheet } from '@/components/patterns/AppSheet';
import { AccessEndedState, EmptyState, ErrorState, LoadingState, LockedState } from '@/components/patterns/States';
import { FormField, FormLayout, FormRow } from '@/components/patterns/FormLayout';
import { MonthChip } from '@/components/shell/MonthChip';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <View testID={`pattern-${id}`} className="gap-3">
      <Text role="heading" aria-level={2} className="text-lg font-semibold text-foreground dark:text-zinc-50">
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function DevPatterns() {
  const sheet = useSheet();
  const [amount, setAmount] = useState('');
  if (!__DEV__ || Platform.OS !== 'web') return <Redirect href="/" />;
  return (
    <ScrollView className="flex-1 bg-background dark:bg-zinc-950" contentContainerClassName="mx-auto w-full max-w-[1200px] gap-6 px-4 py-6 md:px-6 lg:px-8">
      <Section id="page-header" title="PageHeader">
        <PageHeader title="How is November going?" subtitle="Title shows here from 768 px; on a phone the top bar carries it." right={<MonthChip />} />
      </Section>
      <Section id="summary-card" title="SummaryCard">
        <SummaryCard
          label="Left to spend in November"
          amount="GHS 1,072.50"
          progress={52}
          sentence="Spent 1,177.50 of 2,250.00 · 8 days left"
          details={<Text className="text-sm text-muted-foreground dark:text-zinc-400">Needs 1,137.50 · Wants 40.00 · Savings 0.00</Text>}
        />
      </Section>
      <Section id="list-row" title="ListRow">
        <ListGroup title="Today">
          <ListRow title="Groceries" sub="Needs · Household account" amount="−GHS 12.50" onPress={() => undefined} />
          <ListRow title="Transport with a deliberately long budget line label that must truncate" sub="Needs · Cash" amount="−GHS 1,250,000.00" onPress={() => undefined} />
          <ListRow title="Read-only row" sub="No disclosure" amount="GHS 0.00" />
        </ListGroup>
      </Section>
      <Section id="form" title="Form layout">
        <FormLayout
          summary={<Text className="text-sm font-semibold text-foreground dark:text-zinc-50">Posts to November 2026 · Household account · GHS 12.50 · 2026-11-23</Text>}
          primary={<AppButton label="Save example" size="touch-lg" onPress={() => undefined} />}
          secondary={<AppButton label="Cancel" variant="ghost" size="touch" onPress={() => undefined} />}
        >
          <FormField label="Amount">
            <AppInput value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" className="text-3xl" />
          </FormField>
          <FormRow label="Paid from" value="Household account" onPress={() => undefined} />
        </FormLayout>
      </Section>
      <Section id="sheet" title="Sheet">
        <AppButton label="Open example sheet" size="touch" className="self-start" onPress={sheet.show} />
        <AppSheet
          open={sheet.open}
          onClose={() => sheet.hide()}
          title="Example sheet"
          testID="example-sheet"
          footer={<AppButton label="Done" size="touch-lg" onPress={() => sheet.hide()} />}
        >
          <FormField label="First field">
            <AppInput autoFocus placeholder="Focus starts here" className="" />
          </FormField>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Escape, the close button, the backdrop and browser Back close it; focus returns to the button.</Text>
        </AppSheet>
      </Section>
      <Section id="states" title="States">
        <View testID="state-empty"><EmptyState message="Nothing spent in November yet." actionLabel="Add expense" onAction={() => undefined} /></View>
        <View testID="state-loading"><LoadingState /></View>
        <View testID="state-error"><ErrorState message="Not saved. Check your connection and try again." onRetry={() => undefined} /></View>
        <View testID="state-locked"><LockedState monthLabel="October 2026" /></View>
        <View testID="state-access-ended"><AccessEndedState /></View>
      </Section>
    </ScrollView>
  );
}
