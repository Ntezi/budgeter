import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "./layouts/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Budgets } from "./pages/Budgets";
import { BudgetDetail } from "./pages/BudgetDetail";
import { Transactions } from "./pages/Transactions";
import { Accounts } from "./pages/Accounts";
import { Recurring } from "./pages/Recurring";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { Onboarding } from "./pages/Onboarding";
import { Auth } from "./pages/Auth";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: "/onboarding",
    Component: Onboarding,
  },
  {
    path: "/auth",
    Component: Auth,
  },
  {
    element: <AppLayout />,
    children: [
      { path: "dashboard", Component: Dashboard },
      { path: "budgets", Component: Budgets },
      { path: "budgets/:id", Component: BudgetDetail },
      { path: "transactions", Component: Transactions },
      { path: "accounts", Component: Accounts },
      { path: "recurring", Component: Recurring },
      { path: "reports", Component: Reports },
      { path: "settings", Component: Settings },
    ],
  },
]);
