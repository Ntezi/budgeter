# UI Migration Plan (Redesign Budgeter UI_UX)

## Source of Truth
- Redesign input: `Redesign Budgeter UI_UX/`
- Layout, components, spacing, and theme tokens are aligned to the redesign patterns and adapted for Expo Router + NativeWind.

## Route Migration
| Old Route | New Route | Notes |
| --- | --- | --- |
| `/(tabs)/index` | `/dashboard` | Dashboard is now inside left-nav shell |
| `/(tabs)/budgets` | `/budgets` | Budget list moved to shell route |
| `/budget/[pid]` | `/budgets/[pid]` | Budget detail nested under budgets |
| `/(tabs)/transactions` | `/transactions` | Same capability, redesigned layout |
| `/(tabs)/accounts` | `/accounts` | Same capability, redesigned layout |
| `/(tabs)/recurring` | `/recurring` | Same capability, redesigned layout |
| `/(tabs)/reports` | `/reports` | Same capability, redesigned layout |
| `/(tabs)/settings` | `/settings` | Same capability, redesigned layout |
| Root app entry | `/` + `/_layout` gate | Auth/onboarding gate controls entry flow |
| N/A | `/onboarding` | First-run onboarding screen |
| N/A | `/auth` | Auth screen before shell access |

## Navigation Migration
- Removed bottom-tab shell (`app/(tabs)`).
- Added left navigation shell in `app/(shell)/_layout.tsx`.
- Desktop/web: persistent left sidebar.
- Mobile: collapsible left drawer overlay.

## Styling Migration
- Added NativeWind/Tailwind plumbing:
  - `tailwind.config.js`
  - `babel.config.js`
  - `metro.config.js` (NativeWind integration)
  - `global.css`
  - `nativewind-env.d.ts`
- Centralized design tokens in `tailwind.config.js`:
  - colors
  - radii
  - spacing
  - shadows

## UI Component Migration
- Added redesign-aligned primitives in `components/ui/`:
  - `AppButton.tsx`
  - `AppCard.tsx`
  - `AppBadge.tsx`
  - `AppInput.tsx`
  - `AppSegmented.tsx`
  - `AppProgressBar.tsx`
  - `DropdownField.tsx`

## Business Rules Preserved in Refactor
- Auth gate remains active before app shell access.
- Periods remain monthly (`YYYY-MM`).
- Plan categories remain fixed: `NEED`, `WANT`, `SAVINGS_DEBT`.
- Budget status remains `DRAFT`/`DECIDED`.
- `DECIDED` locks Income + Plan editing; Transactions + Allocations remain editable.
- Auto mode uses projected 50/30/20 targets.
- Manual mode shows real percentages from current plan totals.
- Reconcile supports priority ordering, partial funding, and unfunded indicators.
- Recurring templates, reports, and Excel export remain.

## File Scope Summary
- Added: new shell/auth/onboarding routes, NativeWind setup, UI primitives, theme provider/helpers.
- Changed: root layout/auth flow, repo logic for DECIDED behavior and plan priority, reports/export integration, Firebase platform exports.
- Removed: legacy tab screens and unused pre-redesign UI components.
