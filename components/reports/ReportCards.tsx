// BUDG-8 S14 (08-reports-export.md): four questions, one card each. Presentational only;
// every figure is computed in app/(shell)/reports.tsx with the calculations it had before.
import React, { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LineChart } from '@/components/components/LineChart';
import { LoadingState } from '@/components/patterns/States';
import { AppSegmented } from '@/components/ui/AppSegmented';
import { DropdownField } from '@/components/ui/DropdownField';
import { cn } from '@/lib/cn';
import { fmtMoney } from '@/lib/format';

export function ReportCard({ title, children, testID, right }: { title: string; children: ReactNode; testID?: string; right?: ReactNode }) {
  return (
    <View testID={testID} className="min-w-0 gap-4 rounded-xl border border-border bg-card p-4 shadow-card dark:border-zinc-800 dark:bg-zinc-900 lg:p-5">
      <View className="flex-row items-start gap-2">
        <Text role="heading" aria-level={2} className="min-w-0 flex-1 text-lg font-semibold text-foreground dark:text-zinc-50">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        className="min-h-11 flex-row items-center gap-2 rounded-md"
      >
        <Text className="min-w-0 flex-1 text-sm font-medium text-foreground dark:text-zinc-50">{label}</Text>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#717182" />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/** Label left, value right; the value never wraps or clips (min-w-0 label truncates). */
export function LabelValue({ label, value, sub, valueClassName, onPress }: { label: string; value: string; sub?: string; valueClassName?: string; onPress?: () => void }) {
  const body = (
    <>
      <View className="min-w-0 flex-1">
        <Text className="text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{label}</Text>
        {sub ? <Text className="text-sm text-muted-foreground dark:text-zinc-400">{sub}</Text> : null}
      </View>
      <Text className={cn('shrink-0 text-base font-semibold text-foreground dark:text-zinc-50', valueClassName)} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color="#717182" /> : null}
    </>
  );
  if (!onPress) return <View className="min-h-11 flex-row items-center gap-3">{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} className="min-h-11 flex-row items-center gap-3 rounded-md hover:bg-muted/50 dark:hover:bg-zinc-800/60">
      {body}
    </Pressable>
  );
}

export type ShareRow = { label: string; amount: number; pct: number; color: string };

export function SpendBreakdownCard(p: { title: string; loading: boolean; spent: number; rows: ShareRow[]; topLine?: { name: string; amount: number }; byTag: { x: string; y: number }[] }) {
  return (
    <ReportCard title={p.title} testID="report-spend">
      {p.loading ? (
        <LoadingState rows={2} />
      ) : p.spent <= 0 ? (
        <Text className="text-base text-muted-foreground dark:text-zinc-400">Nothing spent yet.</Text>
      ) : (
        <View className="gap-4">
          <Text className="text-3xl font-bold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>{fmtMoney(p.spent)}</Text>
          {p.rows.map((row) => (
            <View key={row.label} className="gap-1.5">
              <View className="flex-row items-center gap-3">
                <Text className="min-w-0 flex-1 text-base text-foreground dark:text-zinc-50" numberOfLines={1}>{row.label}</Text>
                <Text className="shrink-0 text-base font-semibold text-foreground dark:text-zinc-50" style={{ fontVariant: ['tabular-nums'] }}>
                  {fmtMoney(row.amount)}
                </Text>
                <Text className="w-10 shrink-0 text-right text-sm text-muted-foreground dark:text-zinc-400">{`${Math.round(row.pct)}%`}</Text>
              </View>
              <View className="h-2 overflow-hidden rounded-full bg-muted dark:bg-zinc-800">
                <View className={cn('h-2 rounded-full', row.color)} style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }} />
              </View>
            </View>
          ))}
          {p.topLine?.name ? <LabelValue label={`Biggest line: ${p.topLine.name}`} value={fmtMoney(p.topLine.amount)} /> : null}
        </View>
      )}
      <Disclosure label="Set aside by tag">
        <View className="gap-1">
          {p.byTag.map((t) => (
            <LabelValue key={t.x} label={t.x} value={fmtMoney(t.y)} />
          ))}
        </View>
      </Disclosure>
    </ReportCard>
  );
}

export type TrendRange = '3' | '6' | '12';

export function TrendCard(p: { range: TrendRange; onRange: (r: TrendRange) => void; loading: boolean; points: { x: string; y: number }[]; sentence: string; lineColor: string; axisColor: string }) {
  return (
    <ReportCard title="How does it compare?" testID="report-trend">
      <AppSegmented
        touch
        className="self-start"
        value={p.range}
        onChange={p.onRange}
        options={[
          { label: '3 months', value: '3' },
          { label: '6 months', value: '6' },
          { label: '12 months', value: '12' },
        ]}
      />
      {p.loading && p.points.length < 2 ? (
        <LoadingState rows={2} />
      ) : p.points.length < 2 ? (
        <Text className="text-base text-muted-foreground dark:text-zinc-400">Comparisons start after your second month.</Text>
      ) : (
        <View className="min-w-0 gap-3 overflow-hidden">
          <Text className="text-base text-foreground dark:text-zinc-50">{p.sentence}</Text>
          <Text className="text-sm text-muted-foreground dark:text-zinc-400">Spent per month</Text>
          <LineChart data={p.points} lineColor={p.lineColor} axisColor={p.axisColor} />
        </View>
      )}
    </ReportCard>
  );
}

export function PricesCard(p: {
  options: { label: string; value: string }[];
  value: string;
  onPick: (id: string) => void;
  points: { x: string; y: number }[];
  latest?: { price: number; change: number; changePct: number; min: number; max: number; count: number };
  onCatalog: () => void;
  lineColor: string;
  axisColor: string;
}) {
  return (
    <ReportCard title="What do things cost now?" testID="report-prices">
      {!p.options.length ? (
        <Text className="text-base text-muted-foreground dark:text-zinc-400">Prices appear after you add a receipt or record a shop.</Text>
      ) : (
        <View className="z-10 gap-1.5">
          <Text className="text-sm font-medium text-foreground dark:text-zinc-50">Item</Text>
          <DropdownField value={p.value} options={p.options} onChange={p.onPick} placeholder="Pick an item" menuStrategy="inline" triggerClassName="h-11" />
        </View>
      )}
      {p.value && p.latest ? (
        <View className="min-w-0 gap-1 overflow-hidden">
          <LabelValue
            label="Latest price"
            value={fmtMoney(p.latest.price)}
            sub={p.latest.count > 1 ? `${p.latest.change >= 0 ? '+' : '−'}${fmtMoney(Math.abs(p.latest.change))} (${p.latest.changePct >= 0 ? '+' : ''}${p.latest.changePct.toFixed(1)}%) since last time` : 'One price so far'}
          />
          <LabelValue label="Lowest · highest" value={`${fmtMoney(p.latest.min)} · ${fmtMoney(p.latest.max)}`} />
          {p.points.length > 1 ? <LineChart data={p.points} lineColor={p.lineColor} axisColor={p.axisColor} /> : null}
        </View>
      ) : p.value ? (
        <Text className="text-base text-muted-foreground dark:text-zinc-400">No prices recorded for this item yet.</Text>
      ) : null}
      <LabelValue label="See catalog" value="" onPress={p.onCatalog} />
    </ReportCard>
  );
}
