export const fmtMoney = (n: number, currency = 'GHS') => {
    try {
        return new Intl.NumberFormat(undefined, {style: 'currency', currency}).format(n);
    } catch {
        return `${currency} ${n.toFixed(2)}`;
    }
};

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
