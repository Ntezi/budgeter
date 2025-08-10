export type Group = 'NEED' | 'WANT' | 'SAVINGS_DEBT';

export interface BudgetPeriod {
    id: string; // yyyy-mm
    incomeTotal: number;
    targetPct: { needs: number; wants: number; sd: number }; // auto 50/30/20 (configurable)
    targets: { needs: number; wants: number; sd: number }; // computed amounts
    manualTargets?: { needs: number; wants: number; sd: number }; // user-entered for comparison
    manualPct?: { needs: number; wants: number; sd: number }; // derived for display
    totals: { needs: number; wants: number; sd: number };         // actuals (sum of txns)
    surplus: number;
}

export interface ChartSlice {
    label: string;
    value: number;
    color?: string
}
