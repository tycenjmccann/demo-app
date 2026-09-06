# Spec: Persist the Email notifications setting across reloads
- Workflow: wf_1788672380233_ymo7dm
- Epic: TEAM-4138 / Spec ticket: TEAM-4140
- Intent accepted: 2026-09-06 (Intent Acceptance gate TEAM-4139 approved)
- Author: spec author (agentcore_hub_requirements_analyst)
- Status: proposed
- Branch: feature/TEAM-4138-persist-the-email-notifications-setting
- Artifact dir: .sdlc/wf_1788672380233_ymo7dm

## Summary

The Email notifications toggle on the Settings page is currently held in volatile component state (`src/App.tsx:7`, `useState(false)`), so every reload silently resets it to Off while the Activity feed keeps a permanent record in localStorage of the change the user made. The result is the mismatch called out in the intent: the feed says "Turned email notifications on." but the toggle shows Off, and the demo reads as broken. This spec persists the setting to the browser's localStorage as `{ enabled, lastChangedAt }` under a new key, hydrates the toggle from that value on first render, and adds one small "Last changed {relative}" line beneath the control row that reuses the existing `formatRelativeTime` helper so its wording and its 30 second refresh cadence match the Activity feed exactly. The persisted `lastChangedAt` is taken from the `timestamp` of the Activity entry that `addActivity` already returns, which is what makes the line and the feed agree to the millisecond instead of merely agreeing approximately. No backend, no new dependencies, and no change to the toggle button element itself.

## Requirements

### R1 Persist toggle state

Toggling the setting writes both fields to localStorage, and a fresh load reflects the persisted value.

- Given the toggle is Off and nothing is persisted, When the user clicks the toggle, Then localStorage key `demo.settings.emailNotifications` holds JSON `{ "enabled": true, "lastChangedAt": <epoch ms> }`.
- Given `{ "enabled": true, ... }` is persisted, When the app loads, Then the toggle renders text `On` and `aria-pressed="true"` on its very first render.
- Given `{ "enabled": false, ... }` is persisted, When the app loads, Then the toggle renders text `Off` and `aria-pressed="false"`, and this must not be conflated with the nothing-persisted case (an explicit persisted `false` is a real value, not a missing one).
- Given the toggle is On and persisted, When the user clicks it again, Then the persisted `enabled` becomes `false` and `lastChangedAt` is overwritten with the new change time.

### R2 Default when nothing persisted

- Given localStorage has no `demo.settings.emailNotifications` key, When the app loads, Then the toggle is Off with `aria-pressed="false"`, and no Last changed line is present in the DOM at all (not an empty or placeholder line).

### R3 Last changed line

- Given the setting has been changed at least once, When the Settings page renders, Then a small line appears beneath the toggle whose text is exactly `Last changed {relative}`, where `{relative}` is the return value of the existing `formatRelativeTime(lastChangedAt, now)` from `src/activity/formatRelativeTime.ts`. Examples: `Last changed just now`, `Last changed 5m ago`, `Last changed 3h ago`, `Last changed 2d ago`, `Last changed 12w ago`.
- Given two changes in a row, When the line renders, Then it reflects the most recent change only.
- Given a change happened and the page is reloaded, When the app loads, Then the line is still present and its relative label is computed from the persisted `lastChangedAt` against the current time (so a change made 90 minutes before the reload reads `Last changed 1h ago`).
- Given the page is left open without interaction, When 30 seconds elapse, Then the relative label recomputes, on the same cadence and for the same reason as the Activity feed's `REFRESH_INTERVAL_MS` (`src/activity/ActivityFeed.tsx:13`), so the label cannot get stuck reading `just now` forever.
- Given the line renders, Then the relative label is the visible text of a `<time>` element that also carries `dateTime` (ISO 8601, from `new Date(lastChangedAt).toISOString()`) and `title` (the absolute date, from `new Date(lastChangedAt).toString()`), matching `ActivityFeedItem` exactly, including its defense-in-depth guard that omits both attributes when the Date is invalid rather than letting `toISOString()` throw a RangeError during render.
- The absolute time is supplementary only. The relative label is always the visible text, so no information exists solely inside a `title` tooltip.

### R4 Activity feed records each change exactly once

- Given the user clicks the toggle once, When the click is handled, Then `addActivity('settings', 'Turned email notifications on.')` or `addActivity('settings', 'Turned email notifications off.')` is called exactly once, with those description strings unchanged from today's code, and `getActivities().length` increases by exactly 1.
- Given that call returns an Activity, Then the value persisted as `lastChangedAt` MUST be that returned Activity's `timestamp`, not a second independent `Date.now()` reading, so the feed entry and the Last changed line agree to the millisecond.
- Given the app mounts or hydrates from persisted state, When the first render and its effects run, Then no activity entry is written. Loading is not a user action, and a hydration-time write would grow the feed on every reload.

### R5 Corrupt or tampered storage

- Given the stored value is absent, is not valid JSON, parses to something that is not a non-null object (including an array), has `enabled` that is not a boolean, or has `lastChangedAt` that is not a finite number with absolute value at most 8.64e15, When the app loads, Then the read is treated as "nothing persisted" and behavior is exactly R2.
- The read never throws, so a corrupt value can never surface as a render-time exception or a blank page.
- The raw stored value is never rendered into the DOM and never written to the console or any log, so tampered content has no path to the page.
- The 8.64e15 bound is the same `MAX_VALID_DATE_TIMESTAMP` reasoning already documented in `src/activity/activityStore.ts:37`: values past it are finite but produce an Invalid Date, which is what would throw at render.

### R6 Storage unavailable or write fails

- Given localStorage is undefined, access is denied (for example a privacy mode or a blocked third-party context), or `setItem` throws (for example quota exceeded), When the user clicks the toggle, Then the toggle still flips in memory for the remainder of the session, the toggle text and `aria-pressed` still update, and the activity entry is still recorded once.
- The storage failure is swallowed silently, mirroring the fail-soft `try`/`catch` in `writeStoredActivities` and `readStoredActivities`.
- No user-facing error message, banner, or toast is shown. Reasoning: a localStorage write failure has no user action attached to it in a demo app with no backend, the click the user just made is still correctly reflected on screen, and the only honest message would be "your preference may not survive a reload", which is noise the user cannot act on. Losing persistence degrades quietly instead of interrupting.

### R7 Existing markup preserved

- Given the implementation is complete, Then the toggle element is byte-for-byte unchanged from `src/App.tsx:31-39`: `<button type="button" className="settings__toggle" aria-label="Toggle email notifications" aria-pressed={...} onClick={...}>` with children `{enabled ? 'On' : 'Off'}`. Only the identifier bound to `aria-pressed` and the children expression may differ if the state variable is renamed; the attribute set, the class name, the label text, and the `On` / `Off` strings do not change.
- No attribute is added to the button, including `aria-describedby`. See Concern 3.
- The surrounding `.settings__control` row, `.settings__control-title`, and `.settings__control-description` markup is unchanged.

### R8 Constraints

- Given the diff, Then `package.json` has no added or changed dependency or devDependency, runtime or dev.
- No backend, no network call, no new endpoint.
- `DEPLOY.md` is untouched. It does not exist anywhere in the repository today, and this change neither creates nor references it.
- `npm test` passes, including every existing test in `src/activity/*.test.*` unmodified.
- `npm run build` (`tsc -b && vite build`) is green.
- `npm run lint` (`tsc --noEmit`) is clean under the repository's `strict`, `noUnusedLocals`, and `noUnusedParameters` settings.

### R9 Automated tests

- Unit tests for the persistence module cover: a write-then-read round trip, the nothing-persisted default, every corrupt-input case enumerated in R5 as separate assertions, and a write failure where `setItem` throws.
- Component tests for `App` cover: toggle, unmount, re-render reads the persisted state (both On and Off); the Last changed text present after a toggle and absent before any toggle; exactly one activity entry per click; and the relative label under fake timers, including the 30 second refresh tick.
- Tests follow the conventions already in `src/activity/activityStore.test.ts` and `src/activity/ActivityFeed.test.tsx`: `localStorage.clear()` in `beforeEach`, `vi.useRealTimers()` reset, `vi.useFakeTimers()` plus `vi.setSystemTime` for time-dependent assertions, and `act()` around store mutations.

## Design

### Scope classification

MODIFY EXISTING, plus one small NET NEW module. File evidence:

- `src/App.tsx` (modify): replace `useState(false)` at line 7 with a lazy initializer that hydrates from the new store; extend `handleEmailNotificationsToggle` (lines 9-17) to persist; add the `now` refresh tick; render the Last changed line after the `.settings__control` div (line 40).
- `src/App.css` (modify): add one class for the new line, reusing the values already present in `.settings__control-description` (lines 59-64).
- `src/settings/emailNotificationsStore.ts` (net new, small): pure module exposing `readEmailNotificationsSetting(): { enabled: boolean; lastChangedAt: number } | null` and `writeEmailNotificationsSetting(setting: { enabled: boolean; lastChangedAt: number }): void`. Both fail soft. Validation per R5. Storage key `demo.settings.emailNotifications`. `null` is the single unambiguous "nothing persisted or unusable" signal, which is what keeps a persisted `enabled: false` distinguishable from a missing key (R1).
- `src/settings/emailNotificationsStore.test.ts` (net new).
- `src/App.test.tsx` (net new): App-level component tests. Placed next to `App.tsx` rather than added to `src/activity/ActivityFeed.test.tsx`, because that file is the Activity feed's suite and this behavior is a Settings behavior.

Reuse, do not rebuild: `formatRelativeTime` for the label, `addActivity` for the feed entry. `src/activity/*` is not modified at all, since redesigning the Activity feed is out of scope and the existing store already returns everything needed.

### Data model

localStorage key `demo.settings.emailNotifications` holds JSON:

```
{ "enabled": true, "lastChangedAt": 1757134321540 }
```

`enabled` is a boolean. `lastChangedAt` is epoch milliseconds, taken from the Activity entry returned by `addActivity`. The key is written only in response to a user toggle, never on mount, never on the 30 second tick. It is a separate key from `demo.activity` so the feed's 100-entry cap and sanitization logic stay independent of the setting.

### UI behavior and placement

The Last changed line is a full-width `<p className="settings__control-meta">` placed directly beneath the `.settings__control` row, as a sibling of it inside `.settings__section`, not inside the flex row.

Rejected alternative: stacking the line inside the right-hand column under the button. `.settings__control` is `display: flex; justify-content: space-between; gap: 1rem` and `.settings__toggle` is `flex: 0 0 auto; min-width: 3.5rem`. At 320 px viewport width, the `.settings` container's `padding: 2rem 1.5rem` plus the section's `padding: 1.5rem` already leave roughly 224 px of content width. Putting a string as long as `Last changed 12w ago` in the right-hand column would widen that inflexible column to about 120 px and squeeze the title column to roughly 100 px, forcing "Email notifications" and its description to wrap hard. A full-width line beneath the row costs one line of vertical space and squeezes nothing.

Styling reuses the exact values already in `App.css`: `font-size: 0.75rem`, `color: #475569`, `line-height: 1.5`, `margin` adjusted only to give the line a small top offset from the row. No new color, font, or size value is introduced. Note that `.settings__section p` sets `font-size: 0.875rem`, so the new class must set `0.75rem` explicitly to match `.settings__control-description`, exactly as that class already does.

Content of the paragraph: the literal text `Last changed ` followed by a `<time>` element whose visible text is the relative label. The trailing space before the `<time>` matters, so the implementer should keep the text node and the element as siblings inside the paragraph rather than composing the whole string inside `<time>`.

The line is NOT an `aria-live` region. The state change itself is already announced through `aria-pressed` on a native button, and announcing a timestamp on every click would be redundant noise layered on top of an announcement the user already gets.

The line is NOT linked to the button with `aria-describedby`, because the intent constrains the toggle's markup and aria attributes to stay as they are. See Concern 3.

### Hydration and refresh

- Hydration: `useState(() => readEmailNotificationsSetting())` with a lazy initializer, so the first paint is already correct. A `useEffect`-based read would render Off first and then correct itself, producing a visible flash of the wrong state, which is a slightly different version of the bug this spec exists to fix.
- Refresh tick: a `useEffect` with `setInterval(..., 30_000)` that updates a `now` state value, cleared in the effect's cleanup. This is the same StrictMode-safe pattern as `ActivityFeed`, where each effect invocation owns and clears its own timer id, so double-invoked development effects leave no duplicate intervals.
- Toggle handler order: compute `next`, then `const activity = addActivity('settings', next ? 'Turned email notifications on.' : 'Turned email notifications off.')`, then `writeEmailNotificationsSetting({ enabled: next, lastChangedAt: activity.timestamp })`, then set React state. `addActivity` must come first because its returned `timestamp` is the value being persisted (R4). Note that this reorders today's code, which calls `setEmailNotificationsEnabled` before `addActivity`; the reorder is behaviorally safe because React state updates are not synchronous reads and `addActivity` does not depend on component state.

### Cross-tab sync

Not implemented. A `storage` event listener would keep two open tabs in agreement, but no one demoing this page has two tabs open on it, and `addActivity` deliberately uses its own pub/sub because the native `storage` event does not fire in the writing tab anyway. Listed under Out of scope.

### Alternatives rejected

- URL or query-string state: does not survive a fresh navigation or a pasted bare URL, and the intent asks for reload persistence.
- Cookies: sent to the server on every request for no benefit, and turns a device-local preference into network-visible data.
- A shared generic `usePersistedState` hook: over-engineering for exactly one setting, and other settings are explicitly out of scope. The right time to generalize is the second caller.
- Extending `activityStore` to also hold the setting: couples a log of past events to a current-state preference, and the feed is out of scope.

## Policy answers

### Security

- Which new or changed surfaces (endpoints, tools, queues, webhooks, buckets, tables) does this feature add, and what is the authorizer and authorization rule for each?

None. No endpoint, tool, queue, webhook, bucket, or table is added or changed. The only new storage surface is one localStorage key on the user's own device, `demo.settings.emailNotifications`, which is governed by the browser's same-origin policy rather than by an application authorizer.

- Is any surface reachable without authentication, and if so why is that unavoidable and who approved it?

N/A: the app has no authentication and adds none. The Settings page is a static client-side page; there is no server-side surface to reach.

- What user-controlled inputs exist, and how is each validated and protected against injection, XSS, SSRF, and path traversal?

Two. First, the click on the toggle, which yields a boolean and carries no payload. Second, the contents of the localStorage key, which the user or a browser extension can edit freely with devtools. That input is parsed inside a `try`/`catch` and validated per R5: object shape, `enabled` must be a boolean, `lastChangedAt` must be a finite number bounded by 8.64e15. Anything else is discarded as "nothing persisted". The stored value is never rendered raw and never interpolated into HTML, a shell command, SQL, or a URL, so there is no injection, XSS, SSRF, or path-traversal path. The only value derived from storage that reaches the DOM is the output of `formatRelativeTime`, which returns one of a fixed set of shapes built from a number.

- What secrets does the feature need, where do they live, and how do they rotate?

None. No credentials, tokens, or keys are involved.

- What data does the feature store or transmit, how is each field classified, and how is confidential or PII data encrypted at rest and in transit?

Stored: one boolean (`enabled`) and one epoch-ms timestamp (`lastChangedAt`). Transmitted: nothing, zero network traffic. Classification: internal. This is a device-local UI preference, not tied to any identity, because the app has no accounts or user records to tie it to. It is stored in plaintext in the browser's localStorage, which is the only option available for client-side persistence and is appropriate for a non-sensitive preference. No KMS applies because nothing leaves the device. Encryption in transit is unchanged and is the hosting site's TLS concern; this feature adds no transmission.

- What can an abusive caller do to run up cost or degrade service, and what limits stop them?

Nothing costs money. There is no server, no metered call, and no per-request billing. A local attacker with devtools access can write a large value to the key, but the read validates and discards anything malformed, the write path stores a fixed two-field object of a few dozen bytes, and the practical ceiling is the browser's own per-origin localStorage quota, which the fail-soft write handles per R6. Degrading one's own browser storage is not a service-degradation vector for anyone else.

- What security-relevant events are logged, where, and what is deliberately excluded from logs?

Nothing is logged. No `console` output is added. Read and write failures are swallowed silently by design (R5, R6). Deliberately excluded: the raw stored value, which is never logged or echoed, so a tampered payload cannot reach a log sink and cannot be reflected back to the page.

- Which existing controls (roles, gateways, WAF rules, KMS keys) does the feature reuse rather than recreate?

The two controls already established in `src/activity/activityStore.ts` and reused verbatim in shape: the fail-soft `try`/`catch` storage pattern for both reads and writes, and the `MAX_VALID_DATE_TIMESTAMP` (8.64e15) timestamp bound with its `Number.isFinite` check. No new control is invented.

### Compliance

- What personal data is collected, derived, or received, from whom, and what is the legal basis for each purpose?

| Field | Source | Purpose | Storage | Special category | Legal basis |
| --- | --- | --- | --- | --- | --- |
| `enabled` (boolean) | The user's own click on the toggle | Remember the user's chosen preference so it survives a reload | Browser localStorage on the user's own device only | No | The user's own explicit action; contract or legitimate interest for a preference the user just set |
| `lastChangedAt` (epoch ms) | Timestamp of that same click | Show when the setting was last changed | Browser localStorage on the user's own device only | No | Same as above |

Stated plainly and without overclaiming: because this app has no accounts and stores nothing that identifies a person, these two fields are arguably not personal data at all. They are a device-local UI preference. The answers below are given on that basis rather than asserting a stricter regime than the facts support.

- Where and when does the user learn about this processing and, where consent is the basis, give and withdraw it?

At the toggle itself. Clicking it is the disclosure and the action in one gesture, and clicking it again reverses it. Consent is not the legal basis relied on, so no separate consent prompt or withdrawal flow is required; there is nothing here that a cookie banner or consent record would meaningfully cover.

- How long is each field kept, what deletes it, and does deletion reach backups, logs, analytics, and vendors?

Both fields are kept until the user toggles again (which overwrites them) or clears site data for this origin in the browser. There is no numeric retention period and no in-app deletion path, which is a gap raised as Concern 2. Deletion reach is trivially complete: there are no backups, no logs (nothing is logged), no analytics, and no vendors, because the data never leaves the device.

- How does a user access, correct, delete, or export this data, and which team or system fulfils the request within the deadline?

The user has direct and complete control through their own browser: devtools or the clear-site-data control reads, edits, and deletes the value. No team or ticketing system is involved because no copy exists anywhere else. Formal data-subject request handling does not attach to data that is not linked to an identifiable person and never reaches the operator.

- Which third parties, including AI/LLM providers, receive personal data, under what agreement, and in which region?

None. No processors, no sub-processors, no vendors, and no AI or LLM provider receives anything. The feature makes zero network calls.

- Does personal data leave the user's jurisdiction, and if so under which transfer mechanism?

No. Nothing leaves the device, so no cross-border transfer occurs and no transfer mechanism (SCCs, adequacy decision) is needed.

- Could minors use this feature, and how is that handled?

Possibly, since the demo has no audience gating or age verification. The handling is that the stored data does not identify anyone, is not used for profiling or advertising, and never leaves the device, so a minor using the toggle creates no additional risk over an adult using it. No age gate is proposed.

- Which compliance documents (ROPA, DPIA, privacy policy, cookie notice, DPA) need updating before launch, and who owns each update?

None required, in this spec author's assessment: a device-local, non-identifying UI preference in a demo app does not create a new processing activity for a ROPA, does not meet a DPIA threshold, involves no processor needing a DPA, and is not a cookie. Stated as an assessment rather than a ruling, and deferred to the compliance lead through Concern 2. No sale or sharing of data occurs. No marketing message is actually sent by this app: the toggle is a preference label only, and no code path dispatches email.

### Brand

- Which brand-kit version or object date did you read, and which voice and tone attributes did you apply?

None. The brand kit at S3 `branding-kit/brand-system.md` was not readable; the object does not exist. No brand values were invented to fill the gap. Raised as Concern 1. In its absence, the tone applied is the tone already present in the shipped UI: short, plain, sentence case, no exclamation marks, as in "Receive updates about important account activity." and "No recent activity yet. Actions you take will show up here."

- What new names (features, screens, tiers, tools, commands) does the spec introduce, and is each approved or proposed?

None. This change introduces no proposed name. "Email notifications", "Settings", and "Recent Activity" are all existing UI strings. The only new user-visible string is `Last changed {relative}`, which is a label rather than a name: sentence case, plain punctuation, no em dash, no emoji, no exclamation mark.

- Which visual tokens (color, type, spacing, icon set) does the feature use, and are any outside the kit?

Only values already present in `src/App.css`: `#475569` for text, `0.75rem` font size, `1.5` line height, the `Inter, system-ui, -apple-system, sans-serif` stack inherited from `.app`, and rem-based spacing consistent with neighboring rules. No new hex value, font, size, or icon is introduced, and no icon set is used at all. Whether those raw values match approved tokens could not be verified without the kit (Concern 1).

- Do any logos or third-party marks appear, and in which approved form?

No. No logo, wordmark, or third-party mark appears in the new line or anywhere in the change.

- What claims does the copy make, and what evidence supports each?

One factual claim: that the setting was last changed at the stated relative time. The evidence is the persisted `lastChangedAt`, which R4 requires to be the exact `timestamp` of the Activity entry recorded for that same change, so the claim is verifiable against the Activity feed and cannot drift from it. No performance, comparative, or promotional claim is made.

- Which disclosures or labels (beta, AI-generated, pricing) does the feature require, and where do they appear?

None. Nothing here is beta-gated, AI-generated, or priced. No disclosure label is required.

- What are the channel constraints for each message surface (UI, push, email, chat, Telegram), and does the sample copy fit them?

UI label only. No push, email, chat, or Telegram surface is touched, and no message is dispatched. The constraint is the width of the Settings card at 320 px viewport width; the longest realistic string, `Last changed 12w ago`, is about 20 characters and stays under roughly 24, which fits on one line as a full-width paragraph beneath the control row.

- Which domain terms does the spec introduce, and does the glossary hold exactly one term per concept?

Four terms, one per concept, used consistently throughout this spec: toggle (the `settings__toggle` button), setting (the persisted preference), Activity feed (the existing Recent Activity section), Last changed line (the new meta line). No synonyms are used for any of them.

### UX

- For each new screen or component, what does the user see and do in the loading, empty, error, partial, success, and disabled states?

One new component: the Last changed line. Loading: N/A, the read is a synchronous localStorage call inside a lazy `useState` initializer, so there is no loading state and no spinner. Empty (the setting has never been changed): the line is absent entirely, per R2, which is more honest than a placeholder like "Never changed". Success and default (the setting has been changed): the line shows `Last changed {relative}`. Error and degraded (corrupt, tampered, or unavailable storage): the line behaves exactly as empty, and the toggle still flips and still records activity for the session (R6). Partial: not applicable; the two fields are written together in one object, so there is no half-written state that validation would accept. Disabled: N/A, the toggle is never disabled and the line is never interactive.

- How does a keyboard-only user complete every task in the feature, and where does focus go after each modal, deletion, or navigation?

Unchanged from today. The control is a native `<button>`: Tab reaches it, Enter and Space activate it, and focus stays on the button after toggling because nothing is unmounted, re-mounted, or moved. There is no modal, no deletion, and no navigation in this feature, so there is no focus to redirect. The new line is non-interactive text and is not in the tab order.

- Which color token pairs are used for text and controls, and do they meet AA contrast in every supported theme?

`#475569` on `#ffffff` for the Last changed line, roughly 7.5:1, which passes AA for the 12 px (0.75rem) size used and is the same pair already used by `.settings__control-description`. The pressed toggle's `#ffffff` on `#0f172a` is existing and unchanged. There is a single light theme; no dark theme exists to check.

- What is announced to screen readers (VoiceOver, NVDA, TalkBack) for images, icon buttons, live regions, and state changes?

The toggle announces its accessible name from the existing `aria-label="Toggle email notifications"` and its state from the existing `aria-pressed`, both unchanged. There are no images and no icon buttons. There is no live region: the Last changed line is deliberately not `aria-live`, because `aria-pressed` already announces the state change and a timestamp announcement on top of it would be redundant. The line is plain text discovered in reading order after the toggle. The `<time>` element's `title` is supplementary only, since the relative label is the visible text, so nothing essential is tooltip-only. The consequence for screen reader users is stated honestly in Concern 3.

- What happens at 320 px width, at 200% zoom, and at the largest Dynamic Type size?

At 320 px: the line is a full-width paragraph beneath the `.settings__control` flex row, so it does not compete with the toggle for horizontal space, it wraps naturally if needed, and no horizontal scrolling is introduced. At 200% zoom: text reflows within the `max-width: 640px` centered container; nothing is clipped or truncated, because the line has no fixed height or width. At the largest Dynamic Type size: the rem-based sizing scales with the root font size and the paragraph wraps to additional lines rather than overflowing.

- What motion does the feature use, and what does it do when reduced motion is requested?

None. There is no animation, transition, or transform added, so `prefers-reduced-motion` needs no handling and none is added.

- Which actions are destructive or irreversible, and how are they confirmed and undone?

None. Toggling is fully reversible with a single click, and the previous `lastChangedAt` is not information the user needs recovered. No confirmation dialog is warranted; adding one to a two-state preference would be friction with no protective value.

- Does any flow involve choosing, paying, cancelling, or declining, and how does the spec show it is free of dark patterns?

Choosing only, with no payment, cancellation, or decline flow. It is free of dark patterns because the default is Off (opt-in, not opt-out), nothing is pre-selected on the user's behalf, both directions cost exactly one click with identical affordance, the two states are labeled with equal weight as `On` and `Off` with no persuasive or shaming copy, and the new line states a neutral fact rather than nudging toward either state.

## Concerns

| # | Concern | Policy | Owner | Proposed resolution | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Brand rule 1: brand kit object `branding-kit/brand-system.md` does not exist in the artifact bucket, so the new string `Last changed {relative}` and the reuse of existing raw CSS values (`#475569`, `0.75rem`) could not be checked against approved vocabulary or tokens. | Brand | human:brand-lead | Approve `Last changed {relative}` (sentence case, reuses the relative-time vocabulary already shown in the Activity feed) and the reuse of the existing App.css values as-is. Alternative: publish the kit and re-check before Plan Approval. | open |
| 2 | Compliance rules 5 and 6: the persisted preference and timestamp have no numeric retention period and no in-app deletion, access, or export path. They live only in the user's browser localStorage until overwritten or until the user clears site data. | Compliance | human:compliance-lead | Accept browser-managed retention as sufficient, because the data is device-local, never transmitted, and not linked to an identifiable person (the app has no accounts), so GDPR and CCPA data-subject paths do not apply. Alternative: add a "Reset settings" control, which is outside the intent's scope. | open |
| 3 | Intent constraint ambiguity: "keep the existing settings__toggle markup and aria attributes" is read strictly as "do not change the button element at all", so the Last changed line is NOT associated with the button via `aria-describedby`. A screen reader user therefore hears the last-changed text only when reading past the button, not when focusing it. | UX (rule 6) and intent | human:product-owner | Accept the strict reading for this run: zero risk to the existing toggle contract and to the tests that assert it. Alternative: allow adding `aria-describedby` pointing at the line, which changes the button's attributes. | open |

## Test plan

Automated, with `vitest` and `@testing-library/react` in the existing jsdom environment. Every suite calls `localStorage.clear()` in `beforeEach` and resets timers with `vi.useRealTimers()`, matching `src/activity/activityStore.test.ts` and `src/activity/ActivityFeed.test.tsx`. A reload is simulated by `unmount()` followed by a fresh `render(<App />)`, which is a faithful stand-in because hydration reads localStorage in a lazy initializer with no module-level cache.

| Req | Test file | What the test does |
| --- | --- | --- |
| R1 | `src/settings/emailNotificationsStore.test.ts` | Writes `{ enabled: true, lastChangedAt: 1_700_000_000_000 }`, asserts the raw JSON under `demo.settings.emailNotifications`, then asserts `readEmailNotificationsSetting()` returns the same object. Repeats for `enabled: false` to prove a persisted `false` round-trips as a value rather than collapsing to `null`. |
| R1 | `src/App.test.tsx` | Renders `App`, clicks the toggle, asserts `aria-pressed="true"` and button text `On`; `unmount()`; renders `App` again and asserts `aria-pressed="true"` and `On` on first render. Then clicks again to Off, unmounts, re-renders, and asserts `aria-pressed="false"` and `Off`. |
| R2 | `src/settings/emailNotificationsStore.test.ts` | With storage empty, asserts `readEmailNotificationsSetting()` returns `null`. |
| R2 | `src/App.test.tsx` | With storage empty, renders `App` and asserts `aria-pressed="false"`, button text `Off`, and that no element matching `/^Last changed/` exists (`queryByText` returns `null`). |
| R3 | `src/App.test.tsx` | With `vi.useFakeTimers()` and `vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))`, clicks the toggle and asserts the text `Last changed just now` is present. Advances the system time by 5 minutes, advances timers past the 30 s tick inside `act()`, and asserts the label has become `Last changed 5m ago` with no further interaction, which is the regression guard for the stuck-label failure mode. |
| R3 | `src/App.test.tsx` | Seeds `{ enabled: true, lastChangedAt: <90 minutes before the fake now> }` directly into localStorage, renders `App`, and asserts `Last changed 1h ago`, proving the label is derived from the persisted timestamp across a reload rather than from mount time. |
| R3 | `src/App.test.tsx` | Asserts the Last changed `<time>` element carries a `dateTime` attribute equal to `new Date(lastChangedAt).toISOString()` and a non-empty `title`, and that the element's visible text is the relative label. |
| R4 | `src/App.test.tsx` | Records `getActivities().length` before each click and asserts it increments by exactly 1 per click, and that the newest entry's `description` is `Turned email notifications on.` then `Turned email notifications off.` on the following click. |
| R4 | `src/App.test.tsx` | After one click, asserts the persisted `lastChangedAt` strictly equals `getActivities()[0].timestamp`, which is the millisecond-agreement requirement. |
| R4 | `src/App.test.tsx` | Renders `App` with a seeded persisted setting and no interaction, and asserts `getActivities()` is still empty, proving hydration writes no activity entry. |
| R5 | `src/settings/emailNotificationsStore.test.ts` | One assertion per corrupt input, each returning `null` and each not throwing: absent key; `'not json'`; `'null'`; `'"a string"'`; `'[]'` (array, not a plain object); `{ enabled: 'yes', lastChangedAt: 1 }`; `{ lastChangedAt: 1 }` (missing `enabled`); `{ enabled: true }` (missing `lastChangedAt`); `{ enabled: true, lastChangedAt: 'x' }`; `{ enabled: true, lastChangedAt: NaN }` serialized as `null` by JSON; `{ enabled: true, lastChangedAt: 8.65e15 }`; `{ enabled: true, lastChangedAt: -8.65e15 }`; and the accepted boundaries `8.64e15` and `-8.64e15`. |
| R5 | `src/App.test.tsx` | Seeds a corrupt value, renders `App`, and asserts no throw, `aria-pressed="false"`, and no Last changed line, that is, the R2 behavior. Also asserts the corrupt raw string does not appear anywhere in `document.body.textContent`. |
| R6 | `src/settings/emailNotificationsStore.test.ts` | `vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })`, then asserts `writeEmailNotificationsSetting(...)` does not throw. A matching spy on `getItem` covers the read side. |
| R6 | `src/App.test.tsx` | With `setItem` throwing, clicks the toggle and asserts the toggle still shows `On` with `aria-pressed="true"`, that `getActivities().length` still incremented by 1 (the activity write is separately fail-soft), and that no error text is rendered. |
| R7 | `src/App.test.tsx` | Asserts the button still resolves by `getByRole('button', { name: 'Toggle email notifications' })`, still has `className` containing `settings__toggle` and `type="button"`, and has no `aria-describedby` attribute. Reviewer additionally diffs `src/App.tsx:31-39` by eye against this spec's R7. |
| R8 | CI and review | `npm test` (all suites, existing ones unmodified), `npm run lint` (`tsc --noEmit`), `npm run build` (`tsc -b && vite build`). Reviewer confirms `package.json` and `package-lock.json` dependency sections are unchanged and that no `DEPLOY.md` was created. |
| R9 | Itself | The rows above are the coverage R9 requires: store round trip, default, each corrupt case, write failure, persistence across remount, label presence and absence, one entry per click, and the fake-timer label refresh. |

Note for the implementer: `src/activity/ActivityFeed.test.tsx` already renders `<App />` in one test and elsewhere asserts relative labels with bare `screen.getByText('just now')`. Once App renders its own relative label, any query like that inside an App render becomes ambiguous and will throw a multiple-elements error. The existing suite passes as written today (its only `render(<App />)` test does not query a relative label), and it must not be modified per R8; new App tests should therefore scope relative-label queries with `within(...)` on the Settings section or query the full `Last changed ...` string rather than the bare label.

Manual and visual: a check at 320 px and at 1280 px viewport width with a screenshot saved under `docs/`, following the naming convention already used there (for example `docs/TEAM-4138-last-changed.png` and `docs/TEAM-4138-narrow.png`). This spec only names the artifact; the implementer or QA produces it.

QA verifies in a real browser, not only in jsdom: toggle On, hard reload, the toggle is still On; toggle Off, hard reload, it is still Off; the Activity feed shows exactly one entry per click; and the feed entry's relative time matches the Last changed line's relative time for the same change. QA also confirms keyboard operation with Tab plus Space, and that focus remains on the toggle after activation.

## Out of scope

From the intent, verbatim: Syncing settings to a server, other settings, redesigning the Activity feed.

Additionally out of scope for this spec:

- Cross-tab live sync via the `storage` event.
- A reset or clear-settings control.
- Migrating the Activity feed to share a generic settings store.
- Changing the toggle from a `<button>` with `aria-pressed` to an element with `role="switch"`.
- Any change to `DEPLOY.md`.

## Build plan

- Spec Approval (human:product-owner) - gate on this spec, blocked by TEAM-4140.
- Plan: Persist the Email notifications setting across reloads (agentcore_hub_frontend_dev) - writes .sdlc/wf_1788672380233_ymo7dm/plan.md only; blocked by Spec Approval.
- Plan Approval (human:engineer) - blocked by the Plan ticket.
- Implement: frontend persistence + Last changed line + tests (agentcore_hub_frontend_dev) - blocked by Plan Approval.
- Review (agentcore_hub_code_reviewer) - diff vs plan.md and spec.md; commits findings.md; blocked by implementation.
- QA (agentcore_hub_qa_verifier) - executes the Test plan above; blocked by review.
- CI (agentcore_hub_ci_agent) - validates build and tests; blocked by QA. Chain ends here (repo is not CD-registered; the orchestrator opens the PR and leaves it for the owning team).
