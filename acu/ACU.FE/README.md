# ACU UI — Frontend

A mobile-first PWA for managing and orchestrating ACU robot devices. Built with React + TypeScript + Vite, themed after the Siemens Healthineers visual identity (Healthineers Orange `#EC6602` on clinical neutrals, generous spacing).

## Highlights

- **Cross-platform PWA** — installable on Android, iOS and desktop browsers (Add to Home Screen on iOS Safari, native install prompt on Chromium).
- **Mobile-first layout** — bottom tab bar on phones, top tab strip on tablet/desktop; master/detail collapses to a stacked drawer on small screens; floating action button on the Workflows screen; touch-friendly 40+px targets.
- **Live connection state** — top bar shows a green "Live" pill while polling succeeds and a pulsing cloud-off icon when the server is unreachable; feature tabs are hidden while offline so cached data cannot mislead the operator.
- **Adaptive polling** — `useDeviceData` polls every 3 s while online and backs off exponentially (5 → 10 → 20 → 30 s cap) while offline, with a single fetch per cycle.
- **Internationalised** — English + German dictionaries in `src/i18n/`, typed against each other so missing keys are compile errors.
- **Offline-aware** — service worker (`public/sw.js`) precaches the app shell, uses network-first for `/api/*` (cached fallback when offline), and SWR for static assets.
- **Healthineers-inspired theme** — design tokens in [`src/theme/tokens.css`](src/theme/tokens.css), supports light & dark.

## Folder layout

```
public/
  manifest.webmanifest         PWA manifest
  sw.js                        Service worker (precache + runtime cache)
  icon.svg / icon-maskable.svg / apple-touch-icon.svg

src/
  main.tsx                     Entry; registers SW in production
  App.tsx                      Composes layout shell + feature views; gates content on isServerOnline
  index.css                    Imports tokens, global styles, ui primitives
  types.ts                     Shared TS types
  icons.ts                     Central icon registry (all `react-icons/md` re-exports)
  about.ts                     Compile-time constants — APP_NAME, APP_VERSION, MANUFACTURER, BRAND_TAGLINE, BUILD_NUMBER

  theme/
    tokens.css                 Design tokens (Healthineers Orange, neutrals, spacing, motion)
    global.css                 Element resets, focus styles, scrollbar

  i18n/
    en.ts                      English dictionary (Dict = typeof en)
    de.ts                      German dictionary
    I18nProvider.tsx           Provider — exposes useI18n() / useT()

  api/                         HTTP clients (axios). deviceApi does one fetch and partitions client-side.
  hooks/
    useDeviceData.ts           Adaptive polling (3 s online → exponential back-off offline) + mutations
    useWorkflows.ts            Workflow CRUD
    useMediaQuery.ts           Responsive breakpoints

  components/
    layout/                    AppShell, TopBar (Live / cloud-off indicator), NavTabs, BottomNav
    ui/                        Reusable primitives: Modal, Toast, EmptyState, ui.css (with .surface-card and .icon-tile)

  features/
    requests/RequestsView.tsx  Connection requests + filter
    devices/DevicesView.tsx    Master/detail with assign-workflow sheet
    devices/WorkflowTimeline.tsx
    workflows/WorkflowsView.tsx Create/edit/delete + bottom-sheet editor
    settings/SettingsView.tsx  App (language) + About (System Information) tabs

  pwa/registerServiceWorker.ts
```

## Scripts

```bash
npm run dev       # Vite dev server (proxies /api → ApiGateway)
npm run build     # tsc + vite build → dist/
npm run preview   # Preview the built bundle
```

## Local configuration

Create `FE/.env` with:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_CT_COMPANION_URL=http://localhost:8000
```

See the [top-level README](../README.md#quick-start) for the full end-to-end
local dev walkthrough (prerequisites, ports, troubleshooting).

The **CT Companion** navigation tab embeds the CT prototype's clinician view
from `ct-companion-mvp` alongside the ACU dashboard. Start the FastAPI service
separately using `ct-companion-mvp/README_RUN.md`; for a different host, set
`VITE_CT_COMPANION_URL` before starting Vite or building the dashboard. The
embedded companion is a research demo and neither changes the existing scanner
workstation nor controls a CT scanner.

## Installing as a PWA

- **Chrome/Edge (desktop & Android):** install icon in the address bar / "Install app" menu.
- **iOS Safari:** Share → *Add to Home Screen*. The status bar uses the `apple-mobile-web-app-status-bar-style` setting; the launcher icon uses `apple-touch-icon.svg`.

The service worker is only registered in production builds, so dev HMR is unaffected.

## Recent changes

See [../doc/CHANGES.md](../doc/CHANGES.md) for a team-ready walkthrough of
the latest FE refactor — architectural restructure, ARIA correctness,
offline UX overhaul, adaptive polling, Settings App/About tabs, central
icon registry, and the icon-semantics audit.
