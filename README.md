# Budgeter

Budgeter is a period-based budgeting app built with Expo, React Native, NativeWind, and Firebase.
It is designed for monthly money planning, tracking, and reconciliation, with collaboration support so households can manage one shared workspace.

The current UI/UX is based on the redesign in `Redesign Budgeter UI_UX`:
- left-side navigation shell
- responsive card/list layouts for web + mobile
- light/dark theme support
- Tailwind/NativeWind utility styling and centralized tokens

## Product Overview

Budgeter is organized around **monthly periods** (`YYYY-MM`) and supports:
- budget planning with fixed categories (`NEED`, `WANT`, `SAVINGS_DEBT`)
- actual transaction tracking
- recurring template generation
- account allocation/reconciliation
- shopping list to transaction workflow
- workspace collaboration by collaborator ID
- reporting + Excel export

## Main Features

### 1) Onboarding + Auth
- First-run onboarding flow with 3 setup steps.
- Auth gate blocks app shell unless signed in.
- Google sign-in is implemented for web.

### 2) Dashboard
- Quick stats for current period: income, spent, net surplus, allocated.
- Spending Plan card supports:
  - `AUTO` comparison mode (50/30/20 targets from active income)
  - `MANUAL` comparison mode (real percentages from current plan totals)
- Recent budgets list with status badges (`DRAFT` / `DECIDED`).
- Fast actions:
  - open current budget
  - create next budget

### 3) Budgets List
- Lists all periods with status and lock indicators.
- Shows per-budget totals:
  - Income
  - Planned
- Create next available budget month (auto-increments if month already exists).

### 4) Budget Details
- Header actions:
  - close budget (`DECIDED`)
  - close and create next budget
  - delete budget
- Budget meta:
  - title
  - target percentages (Needs/Wants/Savings)
  - auto targets + plan targets summary
- Three tabs:
  - **Income**
    - manage multiple income sources
    - toggle active/inactive income (persists immediately)
  - **Spending Plan**
    - grouped cards by category (Needs, Wants, Savings-Debt)
    - add/edit/delete plan items
    - tags, sorting, filtering
    - add plan items from Expense templates
  - **Reconcile**
    - grouped by category with totals (`Planned`, `Funded`, `Unfunded`)
    - partial funding + remaining/unfunded indicators
    - account assignment per plan row
    - priority ordering controls (drag/drop on web + up/down controls)

### 5) Transactions
- Period selector for viewing/editing any budget period.
- Group filters (`ALL`, `NEED`, `WANT`, `SAVINGS_DEBT`).
- Inline add/edit/delete transaction table.
- Generate recurring items into selected period.
- Shopping-linked transactions display shopping source metadata.
- Closed budgets are shown as view-only.

### 6) Accounts
- Account CRUD with type (`BANK`, `MOMO`, `CASH`, `OTHER`).
- Create and edit via modal dialogs.
- Archive support.
- Per-account daily balance reminder toggle.
- Computed balance display from opening balance + allocations.

### 7) Expenses
- Reusable expense templates with:
  - category
  - amount
  - active toggle
  - tags
- Add template directly to selected budget period.
- Convert template to recurring item.
- Tag filter/sort and category totals.

### 8) Shopping Lists
- Create named shopping lists.
- Open one list to manage items.
- Completed items are hidden from pending view and reused as suggestions.
- Item workflow:
  - add name + optional tags + optional budget item mapping
  - mark bought, set cost, complete
  - completion can create a transaction for the selected period
  - assignment to budget item stores category linkage
- Tags + filters + suggestions from previously completed items.

### 9) Recurring
- Manage recurring templates for both flows:
  - `EXPENSE`
  - `INCOME`
- Supports CSV import (`flow,name,amount,group,dayOfMonth,active,start,end,note`).
- Generate recurring into current period.
- Seed next budget period from recurring templates.
- Tag filtering/sorting and active status control.

### 10) Reports
- Accounts summary report:
  - opening, allocated, computed totals
  - allocation mix chart
- Portfolio summary:
  - cross-budget totals
  - category share
  - monthly trend table
- Per-period report cards with refresh/export.
- Excel export for:
  - period-level workbook
  - accounts summary workbook

### 11) Settings + Collaboration
- Theme switching (light/dark).
- Reminder email settings (`enabled`, recipient email, UTC hour).
- Collaboration by collaborator ID:
  - invite workspace members
  - remove members
  - switch active workspace
  - invited members can access owner workspace data.
- Default workspace behavior:
  - if user has shared memberships, app auto-selects shared workspace on login
  - user can switch back to personal workspace in Settings

## Business Rules Implemented

- Period IDs are monthly (`YYYY-MM`).
- Categories are fixed to `NEED`, `WANT`, `SAVINGS_DEBT`.
- Budget status supports `DRAFT` and `DECIDED`.
- Closed/`DECIDED` budgets are treated as locked/view-only in current UI flows.
- Auto planning uses target percentages from active income.
- Manual planning view computes real percentages from plan totals.
- Reconcile supports priority ordering, partial funding, remaining/unfunded visibility.
- Recurring templates, reports, and Excel export are included.

## Tech Stack

- **Frontend**: Expo Router, React Native, TypeScript
- **Styling**: Tailwind CSS + NativeWind
- **Backend**: Firebase Auth + Cloud Firestore
- **Charts**: Victory / custom Pie chart wrapper
- **Export**: `xlsx`
- **Email job support**: `nodemailer` + Firebase Admin SDK

## Project Structure (Key Paths)

- `app/`
  - `app/(shell)/_layout.tsx` responsive left navigation shell
  - `app/(shell)/dashboard.tsx`
  - `app/(shell)/budgets/index.tsx`
  - `app/(shell)/budgets/[pid].tsx`
  - `app/(shell)/transactions.tsx`
  - `app/(shell)/accounts.tsx`
  - `app/(shell)/expenses.tsx`
  - `app/(shell)/shopping.tsx`
  - `app/(shell)/recurring.tsx`
  - `app/(shell)/reports.tsx`
  - `app/(shell)/settings.tsx`
- `providers/`
  - `AuthProvider.tsx`
  - `ThemeProvider.tsx`
  - `WorkspaceProvider.tsx`
- `lib/repo/` Firestore data access modules
- `tailwind.config.js` design tokens
- `firestore.rules` workspace-aware security rules
- `scripts/send-daily-balance-reminders.js` reminder sender
- `Redesign Budgeter UI_UX/` redesign reference baseline

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

Required values:

```dotenv
EXPO_PUBLIC_APP_CURRENCY=GHS
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### 3) Run app

```bash
npm run start
```

Useful variants:

```bash
npm run web
npm run android
npm run ios
```

## Quality Checks

```bash
npm run lint
npx tsc --noEmit
```

## Deployment

This repo is configured for Firebase Hosting with static export (`dist`).

### Prerequisites

```bash
npx firebase-tools login
npx eas-cli@latest login
```

### Web build + Firebase Hosting deploy

```bash
npx expo export --platform web
npx firebase-tools deploy --only hosting
```

### Firestore rules/indexes deploy

```bash
npx firebase-tools deploy --only firestore
```

Firebase config files:
- `.firebaserc`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

### EAS local production builds

Use `eas.json` profiles:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

### EAS Workflows (remote CI builds)

This project includes `.eas/workflows/create-production-builds.yml`.

Run it with:

```bash
npx eas-cli@latest workflow:run create-production-builds.yml
```

The workflow creates production builds for:
- Android
- iOS
- Web

## Daily Reminder Email Script

Run manually:

```bash
npm run reminders:send
```

Required environment for SMTP:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

Optional:
- `SMTP_SECURE=true|false`
- `SMTP_FROM`
- `FIREBASE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json`
- `REMINDER_FORCE=true`

Script path:
- `scripts/send-daily-balance-reminders.js`

## Documentation

- Firestore schema: `docs/firestore-schema.md`
- Repo/API contract: `docs/api-contract.md`
