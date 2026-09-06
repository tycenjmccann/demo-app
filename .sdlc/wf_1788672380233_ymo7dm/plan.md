# Plan: Persist the Email notifications setting across reloads
- Workflow: wf_1788672380233_ymo7dm / Epic: TEAM-4138 / Plan ticket: TEAM-4149
- Spec commit: da1ba85c18e8bdb7ffb4ef4d569a5d0df5a6ab52 / Branch HEAD: da1ba85c18e8bdb7ffb4ef4d569a5d0df5a6ab52 / Author: agentcore_hub_frontend_dev / Status: proposed
- Spec Approval (TEAM-4148) decisions reflected: Concern 1 Brand RESOLVED — string `Last changed {relative}` and reuse of existing App.css values approved, no new tokens. Concern 2 Compliance RESOLVED — browser-managed retention accepted, no Reset control. Concern 3 UX/intent RESOLVED — strict reading: settings__toggle button attributes unchanged, NO aria-describedby this run.

## Approach

The Design lands in this codebase as the following ordered sequence. Line numbers are against the spec-commit state of each file.

### (a) New module `src/settings/emailNotificationsStore.ts`

A pure, dependency-free module mirroring the fail-soft shape of `src/activity/activityStore.ts` (`readStoredActivities`/`writeStoredActivities`, lines 93–124).

- Export a type `EmailNotificationsSetting = { enabled: boolean; lastChangedAt: number }`.
- Storage key constant `const STORAGE_KEY = 'demo.settings.emailNotifications'` (distinct from `demo.activity`).
- `MAX_VALID_DATE_TIMESTAMP`: **define a local constant** `const MAX_VALID_DATE_TIMESTAMP = 8.64e15` in this module. Confirmed: `activityStore.ts:37` declares this value as a **module-private `const`, not exported** (the only exports are `addActivity`, `getActivities`, `subscribe`, and the `Activity`/`ActivityEntry` types). Importing it is therefore impossible without editing `src/activity/*`, which R7/scope forbids. Re-declaring the same literal with the same reasoning comment is the correct move and matches the spec's "reused verbatim in shape, not imported" intent.
- `readEmailNotificationsSetting(): EmailNotificationsSetting | null` — wrap the whole body in `try { … } catch { return null }`. Inside: `const raw = localStorage.getItem(STORAGE_KEY)`; if `!raw` return `null`; `const parsed: unknown = JSON.parse(raw)`; then R5 validation — return `null` unless ALL hold: `parsed` is non-null, `typeof parsed === 'object'`, `!Array.isArray(parsed)`, `typeof parsed.enabled === 'boolean'`, `typeof parsed.lastChangedAt === 'number'`, `Number.isFinite(parsed.lastChangedAt)`, and `Math.abs(parsed.lastChangedAt) <= MAX_VALID_DATE_TIMESTAMP`. On success return `{ enabled, lastChangedAt }`. The raw string is never logged and never returned/rendered.
- `writeEmailNotificationsSetting(setting: EmailNotificationsSetting): void` — `try { localStorage.setItem(STORAGE_KEY, JSON.stringify(setting)) } catch { return }`. No throw escapes.
- Both functions guard `localStorage` access **inside** the `try`, so an undefined `window.localStorage` or a `SecurityError` on property access is swallowed too (R6).

### (b) `src/App.tsx` changes

- Imports: add `useEffect` to the existing `import { useState } from 'react'` (line 2 → `import { useEffect, useState } from 'react'`); import `formatRelativeTime` from `./activity/formatRelativeTime` and `readEmailNotificationsSetting`, `writeEmailNotificationsSetting` (and the type) from `./settings/emailNotificationsStore`.
- Replace `const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false)` (line 7) with a lazy initializer storing the whole persisted object or null:
  `const [setting, setSetting] = useState<EmailNotificationsSetting | null>(() => readEmailNotificationsSetting())`.
  Derive `const enabled = setting?.enabled ?? false` for the button (keeps default-Off when null; keeps a persisted `false` a real value because `setting` is non-null in that case — R1/R2 distinction preserved).
- Add the refresh tick: `const [now, setNow] = useState(() => Date.now())` and a `useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, [])`. This is the exact StrictMode-safe pattern from `ActivityFeed.tsx:65–72` — each effect invocation owns and clears its own `id`. Use `30_000` (matching `REFRESH_INTERVAL_MS`, `ActivityFeed.tsx:13`); a local `const REFRESH_INTERVAL_MS = 30_000` in App.tsx documents the parity without importing from the activity module.
- Rewrite `handleEmailNotificationsToggle` (lines 9–17) in the spec's required order:
  1. `const next = !enabled`
  2. `const activity = addActivity('settings', next ? 'Turned email notifications on.' : 'Turned email notifications off.')` — description strings byte-identical to today (R4).
  3. `writeEmailNotificationsSetting({ enabled: next, lastChangedAt: activity.timestamp })` — persists the Activity's own `timestamp`, not a second `Date.now()` (R4 millisecond agreement).
  4. `setSetting({ enabled: next, lastChangedAt: activity.timestamp })`.
  This reorders today's code (which calls `setEmailNotificationsEnabled` before `addActivity`); safe because `addActivity` reads no component state and React setState is not a synchronous read.
- Button JSX (lines 31–39) is **byte-for-byte unchanged** except the two bound expressions the spec permits: `aria-pressed={enabled}` and children `{enabled ? 'On' : 'Off'}`, where `enabled` is the derived local. Attribute set, `className="settings__toggle"`, `aria-label`, `type`, and the `On`/`Off` strings are untouched. NO `aria-describedby` added (R7 / Concern 3).
- Render the Last changed line as a **sibling of `.settings__control`**, inside `.settings__section`, immediately after the closing `</div>` of the control row (after line 40), rendered **only when `setting` is present**:
  ```
  {setting && (() => {
    const date = new Date(setting.lastChangedAt)
    const isValidDate = !Number.isNaN(date.getTime())
    return (
      <p className="settings__control-meta">
        Last changed{' '}
        <time
          dateTime={isValidDate ? date.toISOString() : undefined}
          title={isValidDate ? date.toString() : undefined}
        >
          {formatRelativeTime(setting.lastChangedAt, now)}
        </time>
      </p>
    )
  })()}
  ```
  The invalid-Date guard mirrors `ActivityFeed.tsx:24–25,35–36` exactly (defense in depth; the store already bounds `lastChangedAt`). The literal `Last changed ` and the `<time>` are sibling nodes (a text node + `{' '}` + element) so the trailing space is preserved, per spec §UI behavior. The line is NOT `aria-live` and carries NO `aria-describedby` link.
- **R4 mount/tick rule, stated explicitly:** the 30 s interval only calls `setNow` — it never calls `addActivity` and never calls `writeEmailNotificationsSetting`. Hydration (the lazy `useState` initializer) only reads. So neither mount nor any tick ever writes storage or grows the activity feed.

### (c) `src/App.css` change

Add one rule after `.settings__toggle` block:
```
.settings__control-meta {
  font-size: 0.75rem;      /* explicit: .settings__section p sets 0.875rem (App.css:36-40) */
  color: #475569;          /* reused from .settings__control-description */
  line-height: 1.5;        /* reused */
  margin: 0.75rem 0 0;     /* small top offset from the control row; no other new value */
}
```
No new color/font/size token is introduced. `font-size: 0.75rem` is set explicitly precisely because `.settings__section p` (App.css:36) would otherwise cascade `0.875rem` onto this `<p>`, exactly as `.settings__control-description` (App.css:59–64) already re-declares it.

### (d) Tests

New `src/settings/emailNotificationsStore.test.ts` and `src/App.test.tsx` — see the Test plan section for the full enumeration. Existing `src/activity/*` tests are not touched.

### (e) Verification commands

`npm test` (vitest run, all suites), `npm run lint` (`tsc --noEmit` under strict / noUnusedLocals / noUnusedParameters), `npm run build` (`tsc -b && vite build`).

### (f) Visual evidence

Real-browser screenshots at 320 px and 1280 px viewport widths, saved under `docs/` following the existing `TEAM-<epic>-<descriptor>.png` convention already used there (`docs/` today holds e.g. `TEAM-3649-empty-state.png`, `TEAM-3649-narrow.png`, `TEAM-3662-verification.png`). Exact files: **`docs/TEAM-4138-last-changed.png`** (1280 px, Settings with the toggle On and the Last changed line visible) and **`docs/TEAM-4138-narrow.png`** (320 px, showing the full-width line wraps and squeezes nothing). Uploaded to S3 by the implementer/QA.

### Policy re-check against the concrete design
- **Security:** the only new surface is one localStorage key on the user's own device; the sole storage-derived value reaching the DOM is `formatRelativeTime`'s output (a number → fixed string shape). Raw stored value never rendered/logged. Reads validated + fail-soft; writes fail-soft. Satisfies spec §Security. No deviation from spec.md.
- **Compliance:** stores one boolean + one epoch-ms timestamp, device-local, never transmitted, not identity-linked; browser-managed retention per resolved Concern 2, no Reset control added. No deviation from spec.md.
- **Brand:** only the approved string `Last changed {relative}` (sentence case, reuses the feed's relative vocabulary) and existing App.css raw values; no new token, icon, logo, or claim. No deviation from spec.md.
- **UX:** full-width sibling line, AA-passing `#475569` on `#ffffff`, no `aria-live`, no `aria-describedby`, native `<button>` focus behavior unchanged, no motion. Satisfies the resolved gate decisions. No deviation from spec.md.

## Files

| Path | Change (add/modify/delete) | Why |
| --- | --- | --- |
| `src/settings/emailNotificationsStore.ts` | add | Net-new fail-soft persistence module: `readEmailNotificationsSetting`/`writeEmailNotificationsSetting`, key `demo.settings.emailNotifications`, R5 validation. |
| `src/settings/emailNotificationsStore.test.ts` | add | Unit tests: round trip, default, every R5 corrupt case incl. boundaries, R6 write/read failure. |
| `src/App.tsx` | modify | Lazy hydration, `now` tick + interval, reordered persist handler, Last changed line, unchanged button JSX. |
| `src/App.css` | modify | Add `.settings__control-meta` (explicit 0.75rem, reused color/line-height, small top margin). |
| `src/App.test.tsx` | add | Component tests: persistence across remount, line present/absent, one activity per click, fake-timer refresh, R6/R7. |
| `docs/TEAM-4138-last-changed.png` | add | Visual evidence at 1280 px. |
| `docs/TEAM-4138-narrow.png` | add | Visual evidence at 320 px. |
| `.sdlc/wf_1788672380233_ymo7dm/plan.md` | modify (Deviations rows only, by implementer) | Record any implementation deviation from this plan. |

**MUST NOT change:** `src/activity/*` (activityStore.ts, activityStore.test.ts, formatRelativeTime.ts, formatRelativeTime.test.ts, ActivityFeed.tsx, ActivityFeed.css, ActivityFeed.test.tsx), `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `src/test/setup.ts`. `DEPLOY.md` does not exist and MUST NOT be created.

## What could this break?

- **`ActivityFeed.test.tsx` `render(<App />)` + bare `getByText('just now')` ambiguity** — once App renders its own relative label, a bare label query inside an App render would match multiple nodes and throw. Mitigation: the existing suite's only `render(<App />)` test (`ActivityFeed.test.tsx:51–66`) queries `'On'`, `'settings'`, `'Turned email notifications on.'` — never a relative label — so it stays green untouched; new App tests scope relative-label queries with `within()` on the Settings section or query the full `Last changed …` string. Existing tests confirmed unmodified and still passing.
- **Handler reorder (setState after addActivity)** — behaviorally safe: `addActivity` reads no component state and React setState is not a synchronous read, so computing `next` from the current derived `enabled` before the state update is correct; the persisted `lastChangedAt` must come from `addActivity`'s return, which requires it to run first.
- **Hydration flash** — lazy `useState(() => readEmailNotificationsSetting())` makes first paint already correct; no effect-based read that would render Off then correct itself.
- **StrictMode double-effect duplicate intervals** — each `useEffect` invocation creates and clears its own `setInterval` id in its own cleanup, matching `ActivityFeed`; no duplicate/leaked timer.
- **Hydration / tick writing storage or activity** — neither path calls `addActivity` or `writeEmailNotificationsSetting`; the tick only calls `setNow`. R4 mount rule holds.
- **Persisted `false` vs `null` conflation** — the store returns `null` ONLY for absent/unusable; a valid `{enabled:false,…}` returns a non-null object, so state is non-null and the Last changed line renders while the toggle shows Off (R1/R2).
- **Corrupt storage throwing at render** — read is `try/catch` + full R5 validation returning `null`; plus the invalid-Date guard on `<time>` means even a value that passed validation cannot make `toISOString()` throw.
- **localStorage unavailable (undefined `window.localStorage`, SecurityError on access)** — access sits inside the `try` in both read and write, so it fails soft to `null` / no-op (R6).
- **tsc strict / noUnusedLocals with an unused `now`** — `now` is consumed by `formatRelativeTime(setting.lastChangedAt, now)`; if the line is conditionally not rendered `now` is still referenced by the expression in scope. Ensure no unused import/local remains (e.g. drop `useState(false)` idioms fully).
- **CSS cascade `.settings__section p` overriding size** — new class sets `font-size: 0.75rem` explicitly to win over the `0.875rem` `p` rule (same technique `.settings__control-description` already uses).
- **Accessibility** — no `aria-live`, no `aria-describedby` per resolved Concern 3; `aria-pressed` on the native button still announces the state change; the line is plain text in reading order after the toggle.
- **320 px layout** — the line is a full-width sibling paragraph beneath the flex row, so it never squeezes the title/toggle columns; wraps naturally.
- **Shared state / race** — none: single tab, synchronous localStorage, no cross-tab `storage` listener (out of scope).
- **Performance** — one 30 s timer, one `setNow` per tick, negligible.
- **act() warnings under fake timers** — wrap `vi.advanceTimersByTime(...)` in `act()` so React flushes the interval-driven re-render, matching `ActivityFeed.test.tsx:204`.

## Test plan

All new tests run under `npm test` (vitest run, jsdom). Each suite calls `localStorage.clear()` in `beforeEach` and resets timers with `vi.useRealTimers()`, matching `activityStore.test.ts` / `ActivityFeed.test.tsx`. A reload is simulated by `unmount()` then a fresh `render(<App />)`. Also gated by `npm run lint` and `npm run build`. **Existing tests are NOT modified.**

### `src/settings/emailNotificationsStore.test.ts` — `describe('emailNotificationsStore')`
- R1 `it('round-trips a written setting (enabled: true)')` — writes `{ enabled: true, lastChangedAt: 1_700_000_000_000 }`, asserts raw JSON under `demo.settings.emailNotifications`, then `readEmailNotificationsSetting()` deep-equals it.
- R1 `it('round-trips a persisted false as a value, not null')` — same with `enabled: false`; asserts read returns the object, not `null`.
- R2 `it('returns null when nothing is persisted')` — empty storage → `null`.
- R5 `describe('corrupt or tampered storage returns null and never throws')` — one `it` (or one assertion) per case, each asserting `null` and no throw:
  - absent key
  - `'not json'` (invalid JSON)
  - `'null'`
  - `'"a string"'`
  - `'[]'` (array, not a plain object)
  - `{ enabled: 'yes', lastChangedAt: 1 }` (enabled not boolean)
  - `{ lastChangedAt: 1 }` (missing enabled)
  - `{ enabled: true }` (missing lastChangedAt)
  - `{ enabled: true, lastChangedAt: 'x' }` (lastChangedAt not number)
  - `{ enabled: true, lastChangedAt: NaN }` (serializes to `null` via JSON → not finite)
  - `{ enabled: true, lastChangedAt: 8.65e15 }` (over positive bound → rejected)
  - `{ enabled: true, lastChangedAt: -8.65e15 }` (over negative bound → rejected)
  - `it('accepts the +8.64e15 boundary')` — `{ enabled: true, lastChangedAt: 8.64e15 }` → returns the object.
  - `it('accepts the -8.64e15 boundary')` — `{ enabled: true, lastChangedAt: -8.64e15 }` → returns the object.
- R6 `it('write does not throw when setItem throws')` — `vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })`; assert `writeEmailNotificationsSetting({ enabled: true, lastChangedAt: 1 })` does not throw; `mockRestore()`.
- R6 `it('read returns null when getItem throws')` — `vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })`; assert `readEmailNotificationsSetting()` returns `null` and does not throw. (`Storage.prototype` spying confirmed working in this jsdom setup — localStorage methods live on `Storage.prototype`.)

### `src/App.test.tsx` — `describe('App email notifications persistence')`
- R1 `it('persists across remount for On then Off')` — render, click toggle, assert `aria-pressed="true"` and text `On`; `unmount()`; re-render, assert `aria-pressed="true"` and `On` on first render; click to Off, unmount, re-render, assert `aria-pressed="false"` and `Off`.
- R2 `it('is Off with no Last changed line when nothing is persisted')` — empty storage, render, assert `aria-pressed="false"`, `Off`, and `screen.queryByText(/^Last changed/)` is `null`.
- R3 `it('shows "Last changed just now" after a toggle and refreshes to "5m ago" on the 30s tick')` — `vi.useFakeTimers()`, `vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))`; click; assert full string `Last changed just now`; advance system time 5 min and `act(() => vi.advanceTimersByTime(...))` past a 30 s tick; assert `Last changed 5m ago` with no further interaction (stuck-label regression guard). Scope with `within()` / full-string to avoid the ActivityFeed bare-label trap.
- R3 `it('derives the label from the persisted timestamp across a reload (1h ago)')` — seed `{ enabled: true, lastChangedAt: <fake now − 90 min> }` into localStorage, render, assert `Last changed 1h ago`.
- R3 `it('renders the label inside a <time> with dateTime and non-empty title')` — assert the `<time>` `dateTime === new Date(lastChangedAt).toISOString()`, `title` non-empty, visible text is the relative label.
- R4 `it('records exactly one activity per click with the expected descriptions')` — capture `getActivities().length` before each click, assert +1 each; newest entry `description` is `Turned email notifications on.` then `Turned email notifications off.`.
- R4 `it('persists lastChangedAt equal to the recorded activity timestamp')` — after one click, assert persisted `lastChangedAt === getActivities()[0].timestamp`.
- R4 `it('writes no activity on hydration')` — seed a persisted setting, render with no interaction, assert `getActivities()` is empty.
- R5 `it('treats corrupt storage as empty and never leaks the raw value')` — seed a corrupt string, render, assert no throw, `aria-pressed="false"`, no Last changed line, and the corrupt raw string is absent from `document.body.textContent`.
- R6 `it('still flips and records once when setItem throws')` — spy `Storage.prototype.setItem` to throw, click, assert toggle shows `On` / `aria-pressed="true"`, `getActivities().length` incremented by 1, no error text rendered; `mockRestore()`.
- R7 `it('leaves the toggle button markup unchanged and adds no aria-describedby')` — `getByRole('button', { name: 'Toggle email notifications' })` resolves, `className` contains `settings__toggle`, `type="button"`, and `expect(button).not.toHaveAttribute('aria-describedby')`.

Visual evidence: screenshots at 320 px and 1280 px saved under `docs/` (`docs/TEAM-4138-last-changed.png`, `docs/TEAM-4138-narrow.png`) and uploaded to S3 by the implementer. R9 coverage is the union of the above (store round trip, default, each corrupt case, write failure, persistence across remount, label present/absent, one entry per click, fake-timer refresh).

## Rollback

The change ships as a single squash/merge PR, so rollback is `git revert` of that one merge commit. The feature is purely additive: reverting removes the reader (`readEmailNotificationsSetting`), so any stale `demo.settings.emailNotifications` key left in a user's browser is simply never read again and is harmless — no migration, no backend, no server-side data to clean up. Users who want the key gone can clear site data. The activity feed key `demo.activity` is a separate key and is unaffected by either shipping or reverting this change.

## Open questions

None. Trivially decidable items were decided in this plan: the store exports the `EmailNotificationsSetting` type (so App can annotate its `useState`); the new CSS uses `margin: 0.75rem 0 0` for the small top offset (only the margin differs from `.settings__control-description`; no new color/size/line-height); `MAX_VALID_DATE_TIMESTAMP` is re-declared locally in the new module because `activityStore.ts` does not export it.

## Deviations

None yet.
