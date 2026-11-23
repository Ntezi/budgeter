import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MonthPlanView } from '@/components/plan/MonthPlanView';

/** Deep link to one month's plan: the same Month view the Plan tab shows (BUDG-8 S5). */
export default function BudgetDetailScreen() {
  const { pid } = useLocalSearchParams<{ pid: string }>();
  return <MonthPlanView pid={String(pid)} />;
}
