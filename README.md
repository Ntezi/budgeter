# Budgeter (Expo + Firebase)

Budgeter is a monthly budgeting app with period-based planning (`YYYY-MM`), actual transaction tracking, recurring templates, and wallet allocation dispatch.

## Key Features

- Monthly periods with status: `DRAFT` / `DECIDED`
- 50/30/20 targets (auto) + manual plan items
- Transactions by group (`NEED`, `WANT`, `SAVINGS_DEBT`)
- Canonical recurring template flow (income + expense templates)
- Accounts / Wallets tab:
  - account CRUD + archive
  - per-period wallet defaults + totals
  - per-budget account selection and item-level allocations (e.g. `Electricity -> MoMo`)
  - allocations remain editable even after `DECIDED`
  - allocation defaults auto-applied to new periods (idempotent)
  - computed balances (`openingBalance + all allocations`)
- Reminder settings for daily email prompts (integration-ready)

## Tech Stack

- Expo Router + React Native + TypeScript
- Firebase Auth (Google popup on web) + Firestore
- Victory charting

## Setup

1. Install dependencies

```bash
npm install
```

2. Create local env file

```bash
cp .env.example .env
```

3. Fill Firebase values in `.env`

```dotenv
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
EXPO_PUBLIC_APP_CURRENCY=GHS
```

4. Start app

```bash
npx expo start
```

## Firebase Rules / Deploy

- Rules file: `firestore.rules`
- Firebase config files: `firebase.json`, `.firebaserc`

Deploy Firestore rules/indexes:

```bash
npx firebase deploy --only firestore
```

## Quality Commands

```bash
npm run lint
npx tsc --noEmit
```

## Reminder Email Integration

UI stores reminder settings at `users/{uid}/settings/reminders`.

Current implementation is integration-ready (data model + UI). For sending:

1. Add a scheduled Cloud Function (daily).
2. Read reminder settings for users with `dailyBalanceReminderEnabled == true`.
3. Enqueue/send email via your provider (SendGrid, SES, Postmark, etc.).
4. Keep provider keys in server-side env only (never commit secrets).

A runnable stub entry point is provided at:

- `scripts/daily-balance-reminder-stub.js`

## Edit Policy for `DECIDED` Periods

- Locked after `DECIDED`: income items, plan items, transactions, period delete.
- Allowed after `DECIDED`: wallet allocations (dispatch/rebalancing) in Budget and Accounts.

## Project Docs

- Firestore schema: `docs/firestore-schema.md`
- API contract: `docs/api-contract.md`
