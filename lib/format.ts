export const fmtMoney = (n: number, currency = 'GHS') => {
    try {
        return new Intl.NumberFormat(undefined, {style: 'currency', currency}).format(n);
    } catch {
        return `${currency} ${n.toFixed(2)}`;
    }
};

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Parse strings like "8,000" / "8000.50" → number
export const parseMoney = (s: string) =>
    Number(String(s).replace(/[^0-9.\-]/g, '')) || 0;

// Clamp and normalize percent input given in 0–100 form
export const parsePct100 = (s: string) => {
    const v = Number(String(s).replace(/[^0-9.\-]/g, '')) || 0;
    return Math.max(0, Math.min(100, v)) / 100; // return 0–1
};
