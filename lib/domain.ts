export type WalletTag = 'NEEDS' | 'WANTS' | 'SAVINGS';

export const WALLET_TAGS: WalletTag[] = ['NEEDS', 'WANTS', 'SAVINGS'];

export const walletTagLabel: Record<WalletTag, string> = {
  NEEDS: 'Needs',
  WANTS: 'Wants',
  SAVINGS: 'Savings',
};

export const walletTagColor: Record<WalletTag, { bg: string; fg: string }> = {
  NEEDS: { bg: '#DBEAFE', fg: '#1E3A8A' },
  WANTS: { bg: '#FEF3C7', fg: '#92400E' },
  SAVINGS: { bg: '#DCFCE7', fg: '#14532D' },
};

export type WalletType = 'BANK' | 'MOMO' | 'CASH' | 'OTHER';

export const walletTypeOptions: WalletType[] = ['BANK', 'MOMO', 'CASH', 'OTHER'];

