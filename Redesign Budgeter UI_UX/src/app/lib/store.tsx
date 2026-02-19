import React, { createContext, useContext, useState, useEffect } from 'react';
import { addMonths, format, subMonths } from 'date-fns';

// Types
export type Category = 'Needs' | 'Wants' | 'Savings-Debt';
export type BudgetStatus = 'Draft' | 'Decided';

export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
}

export interface PlanItem {
  id: string;
  name: string;
  category: Category;
  amount: number; // Planned amount
  accountId?: string; // Mapped account
  priority: number; // 1 is highest
}

export interface Budget {
  id: string;
  period: string; // YYYY-MM
  status: BudgetStatus;
  income: IncomeSource[];
  plan: PlanItem[];
  createdAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: Category | 'Income';
  budgetId?: string; // Optional linking to specific budget
  accountId?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'Checking' | 'Savings' | 'Credit' | 'Investment';
  balance: number; // Opening balance
}

interface AppState {
  budgets: Budget[];
  transactions: Transaction[];
  accounts: Account[];
  addBudget: (period: string) => void;
  updateBudget: (budget: Budget) => void;
  deleteBudget: (id: string) => void;
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  updateTransaction: (transaction: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (account: Omit<Account, 'id'>) => void;
  updateAccount: (account: Account) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

// Mock Data
const INITIAL_ACCOUNTS: Account[] = [
  { id: '1', name: 'Main Checking', type: 'Checking', balance: 5400 },
  { id: '2', name: 'Emergency Fund', type: 'Savings', balance: 12000 },
  { id: '3', name: 'Credit Card', type: 'Credit', balance: -450 },
];

const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: '1', date: '2024-02-15', amount: 1200, description: 'Rent', category: 'Needs' },
  { id: '2', date: '2024-02-18', amount: 150, description: 'Groceries', category: 'Needs' },
  { id: '3', date: '2024-02-20', amount: 60, description: 'Dinner Out', category: 'Wants' },
  { id: '4', date: '2024-02-01', amount: 3200, description: 'Salary', category: 'Income' },
];

const INITIAL_BUDGETS: Budget[] = [
  {
    id: '1',
    period: format(new Date(), 'yyyy-MM'), // Current Month
    status: 'Draft',
    income: [
      { id: '1', name: 'Salary', amount: 3200 },
      { id: '2', name: 'Freelance', amount: 500 },
    ],
    plan: [
      { id: '1', name: 'Rent', category: 'Needs', amount: 1200, priority: 1, accountId: '1' },
      { id: '2', name: 'Groceries', category: 'Needs', amount: 400, priority: 2, accountId: '1' },
      { id: '3', name: 'Utilities', category: 'Needs', amount: 150, priority: 3, accountId: '1' },
      { id: '4', name: 'Dining Out', category: 'Wants', amount: 200, priority: 4, accountId: '1' },
      { id: '5', name: 'Emergency Fund', category: 'Savings-Debt', amount: 500, priority: 5, accountId: '2' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    period: format(subMonths(new Date(), 1), 'yyyy-MM'), // Last Month
    status: 'Decided',
    income: [
      { id: '1', name: 'Salary', amount: 3200 },
    ],
    plan: [
      { id: '1', name: 'Rent', category: 'Needs', amount: 1200, priority: 1, accountId: '1' },
      { id: '2', name: 'Groceries', category: 'Needs', amount: 350, priority: 2, accountId: '1' },
      { id: '3', name: 'Savings', category: 'Savings-Debt', amount: 1000, priority: 3, accountId: '2' },
    ],
    createdAt: subMonths(new Date(), 1).toISOString(),
  }
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [budgets, setBudgets] = useState<Budget[]>(INITIAL_BUDGETS);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [accounts, setAccounts] = useState<Account[]>(INITIAL_ACCOUNTS);

  const addBudget = (period: string) => {
    const newBudget: Budget = {
      id: Math.random().toString(36).substr(2, 9),
      period,
      status: 'Draft',
      income: [],
      plan: [],
      createdAt: new Date().toISOString(),
    };
    setBudgets([...budgets, newBudget]);
  };

  const updateBudget = (updatedBudget: Budget) => {
    setBudgets(budgets.map(b => b.id === updatedBudget.id ? updatedBudget : b));
  };

  const deleteBudget = (id: string) => {
    setBudgets(budgets.filter(b => b.id !== id));
  };

  const addTransaction = (t: Omit<Transaction, 'id'>) => {
    const newTransaction = { ...t, id: Math.random().toString(36).substr(2, 9) };
    setTransactions([newTransaction, ...transactions]);
  };

  const updateTransaction = (updatedTransaction: Transaction) => {
    setTransactions(transactions.map(t => t.id === updatedTransaction.id ? updatedTransaction : t));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const addAccount = (a: Omit<Account, 'id'>) => {
    const newAccount = { ...a, id: Math.random().toString(36).substr(2, 9) };
    setAccounts([...accounts, newAccount]);
  };

  const updateAccount = (updatedAccount: Account) => {
    setAccounts(accounts.map(a => a.id === updatedAccount.id ? updatedAccount : a));
  };

  return (
    <AppContext.Provider value={{
      budgets,
      transactions,
      accounts,
      addBudget,
      updateBudget,
      deleteBudget,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addAccount,
      updateAccount
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
