export const Colors = {
    needs: '#2DD4BF',
    wants: '#FB923C',
    sd: '#22C55E',
    neutral: '#E5E7EB',
};

export const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export const autoTargets = (income: number, pct = {n: 0.5, w: 0.3, sd: 0.2}) => ({
    needs: income * pct.n,
    wants: income * pct.w,
    sd: income * pct.sd,
});

export const sumObj = (o: Record<string, number>) =>
  Object.values(o).reduce((a, b) => a + b, 0);