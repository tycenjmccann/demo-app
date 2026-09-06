# Spec: Persist the Email notifications setting across reloads
- Workflow: wf_1788671842392_72iwdp
- Intent accepted: 2026-09-06 (Intent Acceptance gate TEAM-4136, approved)
- Author: spec author (agentcore_hub_requirements_analyst)
- Status: proposed

## Summary
The Settings page's Email notifications toggle uses plain `useState(false)` in `src/App.tsx:7`, so its state is lost on every reload and never matches the "Turned email notifications on/off." entries the Activity feed records. This spec persists the toggle state (and a timestamp of the last change) to `localStorage` under a dedicated key, reads it lazily on first render so there is no flash of the wrong state, and renders a small "Last changed <relative time>" line under the toggle that survives reload. The Activity feed continues to record each change exactly once. This directly satisfies the intent's Problem: the setting sticks across reloads and the feed lines up with what the toggle shows.

## Requirements

### R1 — Toggle state persists On across reload
- Given the toggle is Off and the user clicks it to On
- When the page is reloaded (a fresh mount reading from `localStorage`)
- Then the toggle renders On with `aria-pressed="true"` and button text `On`, with no intermediate render of Off.

### R2 — Toggle state persists Off across reload
- Given the toggle is On and the user clicks it to Off
- When the page is reloaded
- Then the toggle renders Off with `aria-pressed="false"` and button text `Off`.

### R3 — Last-changed line shows relative time and survives reload
- Given the user has toggled the setting at least once
- When the Settings page renders (including after reload)
- Then a line reading `Last changed <relative time>` is shown under the toggle's title/description, where `<relative time>` is produced by the existing `formatRelativeTime` (for example `just now`, `5m ago`, `2h ago`, `3d ago`, `1w ago`), and the stored timestamp survives reload.

### R4 — Last-changed line hidden when never changed
- Given the setting has never been changed (`lastChangedAt` is null on first visit)
- When the Settings page renders
- Then no "Last changed" line and no placeholder is rendered.

### R5 — Relative label stays fresh without user action
- Given the last-changed line is visible showing `just now`
- When 30 seconds or more elapse with the page open and no further clicks
- Then the label re-renders to reflect the elapsed time (for example `1m ago`) via a periodic tick, matching the ActivityFeed refresh cadence.

### R6 — Activity feed records each change exactly once (including StrictMode)
- Given the app is mounted (including under React `<StrictMode>`, which double-invokes effects in development)
- When the user clicks the toggle once
- Then `addActivity('settings', 'Turned email notifications on.' | 'Turned email notifications off.')` is called exactly once for that click, producing exactly one feed entry.

### R7 — Corrupt, missing, wrong-shape, or unavailable localStorage falls back to Off with no crash
- Given the stored value is missing, non-JSON, valid JSON of the wrong shape, or `localStorage` access throws (unavailable / denied)
- When the store is read on first render
- Then it returns `{ enabled: false, lastChangedAt: null }`, the toggle renders Off, the last-changed line is hidden, and no exception reaches React render.

### R8 — Existing toggle markup and aria attributes unchanged
- Given the `.settings__toggle` button in `src/App.tsx:31-39`
- When this feature is implemented
- Then the button keeps `type="button"`, `className="settings__toggle"`, `aria-label="Toggle email notifications"`, `aria-pressed={emailNotificationsEnabled}`, and its `On|Off` text; no markup or aria attributes are removed or renamed.

### R9 — Existing tests pass, build green, no new runtime deps
- Given the repository's current test and build tooling
- When the feature is complete
- Then `npm test` (all existing `src/activity/*.test.*` plus new tests) passes, `npm run lint` (`tsc --noEmit`) passes, `npm run build` (`tsc -b && vite build`) is green, and `package.json` `dependencies` gains no new runtime entries.

## Design

### Scope classification (with file evidence)
- MODIFY EXISTING:
  - `src/App.tsx` — replace `useState(false)` (line 7) with a lazy initializer reading the new store; update `handleEmailNotificationsToggle` (lines 9-17) to persist before/around `addActivity`; render the new last-changed line inside `.settings__control` (lines 26-40).
  - `src/App.css` — add a `.settings__control-meta` rule reusing values already present (`0.75rem`, `#475569`), mirroring `.settings__control-description` at lines 59-64.
- NET NEW:
  - `src/settings/emailNotificationsStore.ts` — a small persistence module mirroring `src/activity/activityStore.ts` (localStorage read/write with try/catch, schema validation, fail-soft default).
  - `src/settings/emailNotificationsStore.test.ts` — unit tests for the store.
  - `src/App.test.tsx` — component tests for initial render, click behavior, last-changed line, and StrictMode single-fire (there is currently no `src/App.test.tsx`; existing component-test patterns live in `src/activity/ActivityFeed.test.tsx`).

### Files to change / add
- `src/App.tsx` (modify)
- `src/App.css` (modify)
- `src/settings/emailNotificationsStore.ts` (new)
- `src/settings/emailNotificationsStore.test.ts` (new)
- `src/App.test.tsx` (new)

### Data model
- New localStorage key: `demo.settings.emailNotifications` (kept separate from `demo.activity`; the toggle state is NOT derived from the activity feed, which is capped at 100 and trimmable and would be a lossy source of truth).
- Stored value: a single JSON object `{ enabled: boolean, lastChangedAt: number | null }` where `lastChangedAt` is epoch milliseconds of the most recent change, or `null` if never changed.
- Validation rules on read (schema-checked, mirroring activityStore's `isValidDateTimestamp`):
  - Parsed value must be a non-null object.
  - `enabled` must be a `boolean`; otherwise fall back.
  - `lastChangedAt` must be `null`, or a finite number with `Math.abs(lastChangedAt) <= 8.64e15` (the same `MAX_VALID_DATE_TIMESTAMP` bound activityStore uses so `new Date(ts).toISOString()` cannot throw a RangeError at render); otherwise fall back.
  - Any failure (missing key, non-JSON, wrong shape, out-of-range timestamp, `localStorage` throwing) returns the default `{ enabled: false, lastChangedAt: null }`.
- Writes are wrapped in try/catch and swallow errors (quota, unavailable) exactly like `writeStoredActivities`, so persistence failure never reaches render. The write persists the full object `{ enabled, lastChangedAt: Date.now() }` on each change.

### UI behavior
- Initial state: `src/App.tsx` reads lazily via `useState(() => readEmailNotificationsSetting())` so the first render is already correct — no flash of Off then On (R1).
- Toggle handler: compute `nextIsEnabled`, `setEmailNotificationsEnabled(nextIsEnabled)`, write the store with `lastChangedAt = Date.now()`, THEN call `addActivity(...)` exactly once — all inside the click handler. The write and `addActivity` MUST live in the click handler and never in a `useEffect` keyed on state, which would double-fire under `<StrictMode>` and record duplicate feed entries (R6).
- Last-changed line: rendered inside `.settings__control`, in the text column beneath the title/description, as `<p className="settings__control-meta">Last changed <time dateTime={ISO} title={absolute}>{formatRelativeTime(lastChangedAt, now)}</time></p>`. Hidden entirely when `lastChangedAt` is `null` (R4) — no placeholder. The `<time>` element mirrors the ActivityFeed pattern (guard the `Date` conversion; emit `dateTime`/`title` only when the date is valid).
- Freshness: `now` is refreshed on a 30s interval matching `ActivityFeed`'s `REFRESH_INTERVAL_MS` (either a local `useEffect` interval in `App` or a tiny shared hook) so `just now` does not go stale (R5). The interval is created and cleared in the same effect so it is StrictMode-safe (no leaked/duplicate timers), following the ActivityFeed precedent.
- Reuse: the existing `formatRelativeTime` (`src/activity/formatRelativeTime.ts`) is used verbatim; no second formatter is added.
- CSS: `.settings__control-meta` uses only values already in `src/App.css` — `font-size: 0.75rem` and `color: #475569` (the same as `.settings__control-description`); no new colors, sizes, or fonts are introduced.

### Alternatives rejected
- (a) Derive toggle state from the latest `settings` activity entry: rejected — the feed is capped at 100 and trimmable, making it a lossy source of truth, and it couples two independent features.
- (b) `useEffect`-based persistence keyed on state: rejected — under `<StrictMode>` the effect double-invokes, risking a double write and a double `addActivity` (duplicate feed entries), plus a first-render flash of the default before the effect runs.
- (c) Cookies or IndexedDB: rejected — over-scoped for a single boolean plus timestamp; the intent constrains storage to `localStorage`.
- No new runtime dependencies, no backend, no changes to `ActivityFeed`.

## Policy answers

### Security
- **Which new or changed surfaces (endpoints, tools, queues, webhooks, buckets, tables) does this feature add, and what is the authorizer and authorization rule for each?** N/A: this is a client-only change. It adds no endpoint, tool, queue, webhook, bucket, or table. The only new "surface" is a browser `localStorage` key (`demo.settings.emailNotifications`) scoped to the site origin and readable only by same-origin script in the user's own browser; there is no server component to authorize.
- **Is any surface reachable without authentication, and if so why is that unavoidable and who approved it?** N/A: the demo app has no authentication and no network surface; the feature reads and writes only the browser's own `localStorage`. There is nothing to authenticate against.
- **What user-controlled inputs exist, and how is each validated and protected against injection, XSS, SSRF, and path traversal?** The only input is a boolean click on the toggle. The stored JSON is parsed and schema-checked on read — `enabled` must be a boolean, `lastChangedAt` must be null or a finite number within ±8.64e15 like activityStore; anything else falls back to the default. React escapes all rendered text (the relative-time string and the `<time>` attributes), and nothing reaches HTML as raw markup, so injection, XSS, SSRF, and path traversal are not applicable.
- **What secrets does the feature need, where do they live, and how do they rotate?** N/A: the feature needs no secrets, keys, or credentials.
- **What data does the feature store or transmit, how is each field classified, and how is confidential or PII data encrypted at rest and in transit?** It stores two fields in the browser's `localStorage`: `enabled` (boolean) and `lastChangedAt` (number or null). Both are classified internal / non-PII user preference. Nothing is transmitted over any network, so encryption in transit is N/A; at rest, storage is the browser's own `localStorage` on the user's device and no confidential or PII data is involved.
- **What can an abusive caller do to run up cost or degrade service, and what limits stop them?** N/A: there is no server, no metered resource, and no shared service. A user can only rewrite a single small key in their own browser; the write is a fixed-size object and there is no cost or shared-service impact.
- **What security-relevant events are logged, where, and what is deliberately excluded from logs?** No logging is added. Storage failures are swallowed silently exactly like `activityStore` (try/catch with no output); there is no console output and nothing security-relevant to exclude.
- **Which existing controls (roles, gateways, WAF rules, KMS keys) does the feature reuse rather than recreate?** N/A: there are no roles, gateways, WAF rules, or KMS keys in this client-only demo app; the feature reuses the existing `localStorage` fail-soft read/write pattern from `src/activity/activityStore.ts` rather than inventing a new one.

### Compliance
- **What personal data is collected, derived, or received, from whom, and what is the legal basis for each purpose?** No personal data is collected, derived, or received. The feature stores a UI preference (`enabled`) and the timestamp of a UI click (`lastChangedAt`) in the user's own browser; there is no identifier, no account, and no server receipt, so there is no personal-data processing requiring a legal basis.
- **Where and when does the user learn about this processing and, where consent is the basis, give and withdraw it?** The user's own action (clicking the toggle) is the processing, and its effect (remembering the setting) is exactly what the intent asked for and is self-evident from the "Last changed" line. Consent is not the basis because no personal data is processed; the user can clear the value at any time by clearing site data.
- **How long is each field kept, what deletes it, and does deletion reach backups, logs, analytics, and vendors?** Both fields are kept indefinitely in the user's own browser `localStorage` until the user clears site data (or the app overwrites them on the next toggle). There is no server copy, no backups, no analytics, and no vendors, so there is nothing further for deletion to reach.
- **How does a user access, correct, delete, or export this data, and which team or system fulfils the request within the deadline?** The data lives entirely in the user's own browser; the user accesses and corrects it by using the toggle, and deletes it by clearing site data via their browser. There is no server-side copy and therefore no team or system request to fulfil.
- **Which third parties, including AI/LLM providers, receive personal data, under what agreement, and in which region?** None. No data leaves the browser and no third party (including any AI/LLM provider) receives anything.
- **Does personal data leave the user's jurisdiction, and if so under which transfer mechanism?** No. No data leaves the browser, so no cross-jurisdiction transfer occurs and no transfer mechanism is needed.
- **Could minors use this feature, and how is that handled?** Minors could use the demo like any visitor, but the feature collects no personal data and creates no profile, so no age-specific handling is required.
- **Which compliance documents (ROPA, DPIA, privacy policy, cookie notice, DPA) need updating before launch, and who owns each update?** No ROPA, DPIA, privacy policy, DPA, or vendor documentation needs updating because no personal data is processed and no vendor is involved. Whether a cookie/storage notice is required under PECR/ePrivacy for the `localStorage` write is raised as a Concern for human:compliance-lead rather than decided here (see Concerns).

Data inventory (Compliance rule 1):

| Field | Type | Classification | Personal data? | Why |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | internal / user preference | No | A UI toggle preference held client-side only, not linked to any identifier or account. |
| `lastChangedAt` | number or null (epoch ms) | internal / UI-event timestamp | No | The time of a local UI click, held client-side only, not linked to any identifier or account. |

### Brand
- **Which brand-kit version or object date did you read, and which voice and tone attributes did you apply?** Honestly: none. The brand kit `branding-kit/brand-system.md` is missing/unreadable in S3 (the key does not exist), so no version or object date could be read and no kit voice/tone attributes could be applied. See Concern 1. The spec reuses only the copy voice already present in `src/App.tsx` (short, plain, sentence-case).
- **What new names (features, screens, tiers, tools, commands) does the spec introduce, and is each approved or proposed?** No new product-facing names. The only new identifiers are internal code artifacts (`emailNotificationsStore.ts`, the `demo.settings.emailNotifications` storage key, the `.settings__control-meta` CSS class), which are not user-facing brand names.
- **Which visual tokens (color, type, spacing, icon set) does the feature use, and are any outside the kit?** Color `#475569` on `#ffffff`, type `0.75rem` in Inter/system-ui — all already present in `src/App.css`. No new tokens and no icons. Whether these match the (unreadable) kit cannot be confirmed; see Concerns 1 and 2.
- **Do any logos or third-party marks appear, and in which approved form?** None.
- **What claims does the copy make, and what evidence supports each?** The only copy is `Last changed {relative time}`, a factual statement of when the setting last changed, backed by the persisted `lastChangedAt` value. No marketing or capability claims are made.
- **Which disclosures or labels (beta, AI-generated, pricing) does the feature require, and where do they appear?** None; the feature involves no beta gating, AI-generated content, or pricing.
- **What are the channel constraints for each message surface (UI, push, email, chat, Telegram), and does the sample copy fit them?** The only surface is the in-app Settings UI. The one string `Last changed {relative time}` is short, plain, sentence case, with no em dash, emoji, or exclamation mark, and fits the UI line comfortably (it wraps within the text column).
- **Which domain terms does the spec introduce, and does the glossary hold exactly one term per concept?** No new domain terms; the spec reuses "Email notifications", "toggle", and "Activity feed" as already used in the codebase, one term per concept.

### UX
- **For each new screen or component, what does the user see and do in the loading, empty, error, partial, success, and disabled states?** No new screen. On the existing Settings page: loading — the toggle renders its persisted state immediately from the lazy store read (no spinner, no flash); empty — before any change (`lastChangedAt` null) the "Last changed" line is hidden and only the toggle shows; error — if storage is unreadable the toggle falls back to Off and the line stays hidden, with no error surface; partial — N/A (single boolean, no partial state); success — after a click the toggle shows On/Off and the line shows `Last changed just now`; disabled — the toggle is never disabled.
- **How does a keyboard-only user complete every task in the feature, and where does focus go after each modal, deletion, or navigation?** The user Tabs to the toggle button and presses Space or Enter to flip it; focus stays on the toggle button after activation. There are no modals, deletions, or navigation, and Tab order is unchanged.
- **Which color token pairs are used for text and controls, and do they meet AA contrast in every supported theme?** `#475569` on `#ffffff` (about 7.6:1) for the meta line and description; `#ffffff` on `#0f172a` (about 17.9:1) for the pressed toggle. Both exceed WCAG AA for normal text. There is a single light theme only.
- **What is announced to screen readers (VoiceOver, NVDA, TalkBack) for images, icon buttons, live regions, and state changes?** The toggle's state change is announced natively via `aria-pressed` on the button (kept from existing markup) together with its `aria-label="Toggle email notifications"`. The "Last changed" meta line is plain text (not a live region), so it is read on navigation but is deliberately not re-announced on every 30s refresh (see Concern 4). No images or icon buttons are added.
- **What happens at 320 px width, at 200% zoom, and at the largest Dynamic Type size?** `.settings__control` is a flexbox with `gap`; the meta line lives in the text column and wraps, so at 320 px width and at 200% zoom there is no horizontal scroll (to be confirmed in manual QA). Dynamic Type is N/A on web.
- **What motion does the feature use, and what does it do when reduced motion is requested?** None. No animation or transition is added, so reduced-motion needs no special handling.
- **Which actions are destructive or irreversible, and how are they confirmed and undone?** None. The toggle is its own undo — clicking again reverses the change — so no confirmation dialog is needed.
- **Does any flow involve choosing, paying, cancelling, or declining, and how does the spec show it is free of dark patterns?** The default stays Off (opt-in), with no pre-selection and no coercive copy, so the flow is free of dark patterns. There is no paying, cancelling, or declining flow.

## Concerns

| # | Concern | Policy | Owner | Proposed resolution | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Brand kit `branding-kit/brand-system.md` is missing/unreadable in S3 (key does not exist), so no kit version, voice, or tone attributes could be read or applied. | Brand rule 1 | human:brand-lead | Reuse only tokens already present in `src/App.css` (`#475569` on `#ffffff`, `0.75rem`, Inter/system-ui) and the existing copy voice; introduce no new names, colors, or type. | open |
| 2 | The repo uses raw hex values (no token names exist in the codebase), so the new `.settings__control-meta` style cannot reference a kit token by name. | Brand rule 4 | human:brand-lead | Reuse the exact existing hex values (`#475569` on `#ffffff`); add no new colors. | open |
| 3 | The intent says "Last changed <relative time>"; the exact time vocabulary is unspecified. | Product ambiguity | human:product-owner | Reuse the existing `formatRelativeTime` vocabulary (`just now`, `5m ago`, `2h ago`, `3d ago`, `1w ago`) and put an absolute timestamp in the `title`/`dateTime` attributes, so the Settings page and Activity feed use identical time vocabulary. | open |
| 4 | The relative label refreshes silently every 30s; wrapping it in an aria-live region would re-announce it to screen readers every 30s. | UX rule 12 / 6 | human:design-lead | Use no live region on the meta line; the state change is already conveyed by `aria-pressed` on the button. | open |
| 5 | The `localStorage` write may count as "storage access" under PECR/ePrivacy cookie rules, which could require a storage/cookie notice. | Compliance (PECR/ePrivacy) | human:compliance-lead | Treat it as the strictly-necessary exemption because the user explicitly asked for the setting to be remembered; confirm whether any notice is nonetheless required. | open |

## Test plan

### Unit tests — `src/settings/emailNotificationsStore.test.ts`
- Read with no stored key returns the default `{ enabled: false, lastChangedAt: null }`.
- Round-trip: writing `{ enabled: true, lastChangedAt: <ts> }` then reading returns the same values.
- Corrupt JSON (non-parseable string) falls back to the default.
- Wrong shape (e.g. `enabled` not a boolean, `lastChangedAt` a string, or out-of-range timestamp beyond ±8.64e15) falls back to the default.
- `localStorage.getItem`/`setItem` throwing (unavailable / denied) is swallowed and read returns the default; write does not throw.

### Component tests — `src/App.test.tsx`
- Initial render reflects stored state: with `{ enabled: true, ... }` pre-seeded, the toggle renders `On` with `aria-pressed="true"` on first render (no flash of Off).
- Clicking the toggle persists to `localStorage`, updates `aria-pressed` and the button text (`Off` -> `On` and back).
- After a click the "Last changed" line appears showing `just now`, and it survives an unmount/remount (reload simulation) reading from the store.
- The "Last changed" line is hidden when `lastChangedAt` is `null` (never changed).
- `addActivity` is called exactly once per click, including when the app is wrapped in `<StrictMode>` (assert one feed entry / one call, not two).

### Commands
- `npm test` (vitest run) — new tests plus all existing `src/activity/*.test.*` pass.
- `npm run lint` (`tsc --noEmit`) — clean.
- `npm run build` (`tsc -b && vite build`) — green.

### Manual QA
- Toggle On, reload the page, confirm still On; toggle Off, reload, confirm still Off.
- Confirm the "Last changed" line appears after a change and shows a relative time, and is absent on a fresh profile.
- Reload at 320 px width and at desktop width; confirm no horizontal scroll and the meta line wraps within the text column.
- Keyboard: Tab to the toggle, activate with Space and with Enter; confirm focus stays on the toggle.
- View at 200% zoom; confirm layout holds and no clipping.

### iOS gateway
N/A: web only.

## Out of scope
- Syncing settings to a server.
- Other settings.
- Redesigning the Activity feed.
- No changes to ActivityFeed rendering.
- No migration of the `demo.activity` key.
- No cross-tab sync via the `storage` event (deliberately excluded).
- No settings reset control.

## Build plan
- Spec Approval (human:product-owner)
- Plan: Persist the Email notifications setting across reloads (agentcore_hub_frontend_dev, plan.md only)
- Plan Approval (human:engineer)
- Implementation: frontend (agentcore_hub_frontend_dev)
- Code review (agentcore_hub_code_reviewer, findings.md)
- QA (agentcore_hub_qa_verifier)
- CI (agentcore_hub_ci_agent)

Note: the repo is NOT CD-registered, so the chain ends at CI and the PR is left open for the owning team.
