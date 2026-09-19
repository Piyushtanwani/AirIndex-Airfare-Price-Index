# AirIndex dashboard

The analyst front end for [AirIndex](../README.md), a real-time airfare price index for
India built for Smart India Hackathon problem statement SIH26056.

This is a read-only client. Every number it shows comes from the backend API; the
dashboard computes nothing of its own. That is deliberate, and it is why the methodology
page renders the API response rather than restating it: the published method and the
screen cannot drift apart.

---

## Running it

```bash
npm install
npm run dev
```

The dashboard is then at <http://localhost:5173> and expects the API at
<http://localhost:8000>. Start the backend first, or every page will show its error state.

| Command | Does |
|---|---|
| `npm run dev` | Development server with hot reload on port 5173 |
| `npm run build` | Type-check with `tsc -b`, then produce `dist/` |
| `npm run preview` | Serve the built `dist/` locally |

### Environment

Copy `.env.example` to `.env` if you need to change either value.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Where the API lives |
| `VITE_API_KEY` | unset | Sent as `X-API-Key` when present. Only needed if the backend has `API_KEY_REQUIRED=true` |

---

## Stack

| Concern | Choice |
|---|---|
| Build | Vite 6 |
| Framework | React 19, TypeScript |
| Styling | Tailwind CSS 3 over CSS custom properties |
| Data | TanStack Query 5 |
| Routing | react-router-dom 7 |
| Charts | Recharts 3 |

No component library and no animation library. The capsule navigation, the sliding active
indicator, the heatmap and every badge are plain Tailwind and CSS, which keeps the bundle
honest and the design tokens authoritative.

Vite is pinned to 6 rather than 8. Vite 8's rolldown build crashed on Windows with a
missing native binding during development of this project.

---

## Layout of the source

```
src/
  main.tsx          Entry point, query client, router
  App.tsx           Route table
  index.css         Design tokens and base styles
  components/
    Layout.tsx        Sticky top bar plus the centred content column
    CapsuleNav.tsx    The pill navigation and its sliding indicator
    Header.tsx        Wordmark, ministry line, methodology version, as-of date
    ThemeToggle.tsx   Light, dark and system
    StatTile.tsx      One figure with a label and optional footnote
    ChartCard.tsx     Titled, described chart container
    DataTable.tsx     Generic sortable table with aria-sort
    DeltaBadge.tsx    Signed percentage change, coloured by direction
    CoverageBadge.tsx Coverage percentage with its band
    Caveats.tsx       Notes and warnings from the API. Load-bearing, see below
    LoadingSkeleton.tsx, ErrorState.tsx, EmptyState.tsx
  hooks/useApi.ts   One TanStack Query hook per endpoint
  lib/
    api.ts            Typed client. An interface per response shape, no `any`
    format.ts         Indian digit grouping, index and percentage formatting
    theme.ts          Theme persistence, every storage access in try/catch
  pages/            One file per route
```

---

## Pages

| Route | File | Shows |
|---|---|---|
| `/` | `Overview.tsx` | Headline index, 90-day chart, coverage, top movers, contribution decomposition |
| `/routes` | `Routes.tsx` | The basket, sortable, with weights and observation counts |
| `/routes/:code` | `RouteDetail.tsx` | One route's series and its lead-time heatmap |
| `/lead-times` | `LeadTimes.tsx` | The booking curve as small multiples |
| `/quality` | `Quality.tsx` | Pass rates, flag counts, daily valid against invalid, source health |
| `/methodology` | `Methodology.tsx` | The published method, rendered from the API |
| `/api` | `ApiExplorer.tsx` | A live request builder against the documented endpoints |
| `/formulas` | `Formulas.tsx` | Eight index formulas side by side with the spread between them |
| `/forecast` | `Forecast.tsx` | Ensemble projection, confidence band, model scorecard |
| `/trust` | `Trust.tsx` | Five data-trust components and the overall score |
| `/scenario` | `Scenario.tsx` | Policy shock sliders, transmission channels, sensitivity |
| `/ask` | `Ask.tsx` | Questions, answers, and the evidence behind each one |
| `/diagnostics` | `Diagnostics.tsx` | Back-test replay, leave-one-out, series anomalies |

---

## Design

### Tokens

Every colour, radius, spacing step and shadow is a CSS custom property on `:root` in
`index.css`. Tailwind reads them through `tailwind.config.ts`, so a token change moves the
whole interface and no component hard-codes a colour.

Dark mode is defined twice, deliberately: once under
`@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and
once under `:root[data-theme="dark"]`. The first respects the operating system, the second
lets the toggle override it.

Colours are also exposed as RGB channel triplets, for example `--color-accent-rgb`, so
Tailwind's opacity modifiers such as `bg-warn/10` work against custom properties.

### Rise and fall are not arbitrary

A **rise** in a price index is bad news for consumers, so it takes the **warm** colour. A
**fall** is good news and takes the **cool** colour. This is the opposite of a stock
ticker, it is applied consistently in `DeltaBadge`, the contribution chart and the anomaly
table, and it is spelled out in ARIA labels rather than left to colour alone.

### Navigation

A single pill-shaped capsule in the sticky top bar, with one filled highlight that
animates between items on route change rather than popping. Twelve destinations is more
than fits comfortably, so the capsule scrolls horizontally with the scrollbar hidden, a
fade at whichever edge has more content, and the active pill scrolled into view on mount
and on navigation. Below roughly 1100px the capsule moves to its own full-width row. The
transition and the scroll behaviour both respect `prefers-reduced-motion`.

### Tone

This is a statistical release portal, not a consumer travel product. Restrained palette,
tabular numerals on every figure, Indian digit grouping through
`Intl.NumberFormat('en-IN')`, and no emoji anywhere in the interface.

---

## Conventions worth keeping

**Never drop a caveat.** Most analytical endpoints return `notes`, `warnings` or a
`caveat` field. These are not decoration: they state what each number cannot support, and
they are the reason the project can be defended to a ministry jury. The shared `Caveats`
component renders them in full, untruncated and uncollapsed, on every page that has them.

**Three states on every page.** Loading skeleton, error with a retry button, and an empty
state. A failed fetch must never render a blank screen. Some empty states are informative
rather than negative: the forecast returns 404 when there is too little history, and the
anomalies panel shows zero flagged days as a good outcome.

**The contract is the source of truth.** `docs/api-contract.md` and
`docs/api-contract-analytics.md` define every response shape. `lib/api.ts` mirrors them
exactly. If the backend changes a field, change the interface rather than reaching for
`any`.

**Accessibility is checked, not assumed.** Real buttons and tables, labels on every
control, `aria-sort` on sortable headers, `aria-current` on the active nav item, and focus
rings that are not clipped by the capsule's overflow.

---

## Known limits

- The production bundle is around 800 kB before compression, mostly Recharts. Route-level
  code splitting would fix it and has not been done.
- There are no frontend tests. The backend suite covers the data; the interface is
  verified by walking it.
- The Docker image runs the development server rather than serving a static build, because
  the dashboard is not the artefact being deployed. For a real deployment, run
  `npm run build` and serve `dist/` from any static host.
