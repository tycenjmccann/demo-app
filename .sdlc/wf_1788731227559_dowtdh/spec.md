# Spec: Clear the Activity feed with an undo window

- Workflow: wf_1788731227559_dowtdh
- Epic: TEAM-4162 / Spec ticket: TEAM-4164
- Intent accepted: 2026-09-06 (Intent Acceptance gate TEAM-4163 approved)
- Author: agentcore_hub_requirements_analyst
- Status: proposed
- Branch: feature/TEAM-4162-clear-the-activity-feed-with-an-undo-window
- Artifact dir: .sdlc/wf_1788731227559_dowtdh
- Policy versions applied: policy-security v1, policy-compliance v1, policy-brand v1, policy-ux v1

## Summary

The Activity feed on the Settings page only grows. Every action appends an entry to localStorage key `demo.activity` (`src/activity/activityStore.ts:29`), the store caps at 100 entries (`src/activity/activityStore.ts:30`), and the feed renders the 20 newest (`src/activity/ActivityFeed.tsx:6`). There is no way to empty it short of clearing the browser's site data by hand, which the intent calls out as the reason a demo session leaves the page full of test entries. This spec adds a `Clear activity` control to the Activity section that empties all stored entries at once, and for a fixed five second window shows an inline `Undo` affordance that restores exactly what was cleared. After the window elapses the clear is permanent and survives reload, because the clear is committed to storage at click time and the undo snapshot lives only in memory.

Two new store functions do the persistence work and reuse the store's existing guarantees rather than re-implementing them: `clearActivities()` empties the key and returns the removed entries, and `restoreActivities(entries)` merges those entries back, both fail-soft and both notifying subscribers through the existing module-level `listeners` Set (`src/activity/activityStore.ts:42`). The feed component gains the Clear button, the inline Undo affordance, a single `role="status"` announcement element, a StrictMode-safe timer, and focus management, all built from native buttons so keyboard and screen reader users can perform both actions. No backend, no new dependencies, no change to `src/App.tsx` or `src/App.css`, and every existing test stays unmodified and passing.

## Requirements

### R1 Clear control

- Given at least one activity is stored (any count up to 100, not merely the 20 that are visible), When the Activity section renders, Then a native `<button type="button">` with accessible name `Clear activity` is present in the section header area next to the `Recent Activity` heading.
- Given no activity is stored, When the Activity section renders, Then the `Clear activity` button is not in the DOM at all, so the empty state has no Clear control to press.
- Given the `Clear activity` button is present, When the user activates it, Then every stored entry is removed from localStorage key `demo.activity` immediately (all entries, not only the 20 visible), the list disappears, and subscribers are notified through the store's existing pub/sub.
- Given the clear has happened, When storage is read again (for example by `getActivities()`), Then it returns an empty array, because the removal is committed to storage at click time.

### R2 Undo window

- Given the user has just activated `Clear activity`, When the clear completes, Then an inline Undo affordance is shown inside the Activity section, replacing the standard empty-state paragraph for the duration of the window, and it is not a fixed-position toast overlay.
- Given the Undo affordance is shown, Then it includes a native `<button type="button">` whose accessible name and visible text are both `Undo`, and it remains available for exactly UNDO_WINDOW_MS milliseconds, where UNDO_WINDOW_MS is a single named constant set to 5000 (the intent's "about five seconds").
- Given the user activates `Undo` within the window, When the restore runs, Then exactly the cleared entries are restored with the same ids, types, descriptions, and timestamps, merged with any entries added during the window, and the store sorts newest-first, de-duplicates by id, and caps at 100 (reusing `sanitizeActivities`, `src/activity/activityStore.ts:71`).
- Given `Undo` has been activated, When the restore completes, Then the Undo affordance is dismissed and the restored entries render in the list.

### R3 Expiry

- Given the Undo affordance is shown, When UNDO_WINDOW_MS elapses without an Undo activation, Then the affordance is removed, the standard empty-state copy `No recent activity yet. Actions you take will show up here.` returns if the feed is still empty, and the cleared entries become unrecoverable because the in-memory snapshot is dropped.
- Given the timer is running, When the component unmounts, Then the timer is cleared so no callback fires after unmount.
- Given React StrictMode double-invokes effects in development, When the effect runs twice, Then each effect invocation owns and clears its own timer id, so no duplicate timer survives and no stale timer fires, matching the interval pattern already used at `src/activity/ActivityFeed.tsx:65`.

### R4 Reload semantics

- Given `Clear activity` was activated, When the page is reloaded at any point after the click (including inside the five second window), Then the feed shows the empty state with no Undo affordance, because the removal was committed to localStorage at click time and the undo snapshot is held only in component or module memory and is never written to storage.
- Given `Undo` was activated and the entries restored, When the page is reloaded, Then the restored entries are shown, because the restore wrote them back to localStorage.
- The reading "a reload inside the five second window loses the ability to undo" is flagged as a Concern for the product owner (Concern 4), because the intent's phrase "after that the clear is permanent and survives reload" could be read as implying that a reload inside the window is not yet permanent. This spec chooses commit-at-click-time; the Concern records the alternative without resolving it.

### R5 No self-logging

- Given `Clear activity` is activated, When the clear runs, Then no Activity entry is written (a "Cleared activity" entry would contradict "empties it").
- Given `Undo` is activated, When the restore runs, Then no Activity entry is written for the undo action itself; only the previously cleared entries are restored.
- Given the Undo window is open, When the user performs another logged action (for example toggling Email notifications, which calls `addActivity`, `src/App.tsx:13`), Then that new entry is written and appears normally, and because at least one entry is now stored the `Clear activity` button is available again.
- Given a second `Clear activity` is activated while a window is already open, When the second clear runs, Then the newly cleared entries are merged into the existing in-memory snapshot and the UNDO_WINDOW_MS window restarts, so a subsequent Undo restores everything that was cleared across both clears.

### R6 Keyboard

- Given a keyboard-only user, When they Tab through the section, Then `Clear activity` and `Undo` are reachable in the tab order as native buttons and are activated by Enter and Space.
- Given `Clear activity` is activated, When the clear completes, Then focus moves to the `Undo` button.
- Given `Undo` is activated, When the restore completes, Then focus moves to the `Clear activity` button, which has reappeared because entries exist again.
- Given the Undo button currently holds focus, When the window expires, Then focus moves to the `Recent Activity` heading (which is given `tabIndex={-1}` so it can receive focus) rather than being dropped to `document.body`.
- Escape is not required and is not added.

### R7 Screen readers

- Given the clear happens, When the announcement fires, Then a single `role="status"` element (implicitly polite) inside the section announces `Activity cleared.`.
- Given the undo happens, When the announcement fires, Then the same `role="status"` element announces `Activity restored.`.
- Given the window expires, When the affordance is removed, Then nothing is announced for the expiry.
- The `Undo` button's accessible name is `Undo` with visible text `Undo`, and the status text and the Undo button are separate elements. The status element is not a `ul`, `li`, or `role="list"`.
- The existing `aria-live="polite"` on the feed's `ul` (`src/activity/ActivityFeed.tsx:79`) is unchanged.

### R8 Storage failure

- Given localStorage throws on the clear write or the restore write (for example quota or access denied), When the operation runs, Then it fails soft exactly like the existing store: no throw reaches React render, no `console` output is produced, and no error UI is shown, matching `writeStoredActivities` and `readStoredActivities` (`src/activity/activityStore.ts:108`, `src/activity/activityStore.ts:118`).
- Given a storage write failed, Then the in-memory list still updates for the session through the pub/sub notification, so the current view stays consistent even though persistence degraded.

### R9 Constraints

- Given the diff, Then `package.json` has no added or changed dependency or devDependency, runtime or dev.
- No backend, no network call, no new endpoint or API.
- `src/App.tsx` and `src/App.css` are byte-identical to their current contents.
- Every existing test in `src/activity/*.test.*` is unmodified and passing.
- `npm test` (`vitest run`), `npm run lint` (`tsc --noEmit`), and `npm run build` (`tsc -b && vite build`) are all green.
- `DEPLOY.md` is not created. It does not exist anywhere in the repository today (confirmed by inspection), and this change neither creates nor references it.

### R10 Automated tests

- Store unit tests cover: `clearActivities()` returns the removed entries and empties storage; `restoreActivities(entries)` merges, de-duplicates by id, sorts newest-first, and caps at 100; both fail soft when `setItem` or `getItem` throw; and both notify subscribers.
- Component tests under fake timers cover: clear empties the list and shows the Undo affordance plus the `Activity cleared.` status; Undo restores exactly the same entries in the same order; advancing UNDO_WINDOW_MS removes the Undo affordance and returns the standard empty copy; reload simulated by unmount plus a fresh render after clear shows the empty feed with no Undo, and after undo shows the entries; the Clear button is hidden when empty; entries added during the window appear and re-enable Clear; a second Clear merges the snapshot; keyboard activation via Enter and Space with focus assertions; and no Activity entry is written by clear or undo.

## Design brief

### Surfaces

The Settings page, Activity section only. No other surface, screen, endpoint, or route is touched.

### Scope classification with file:line evidence

MODIFY EXISTING plus added tests. No net-new module is required, because the two new functions belong on the existing store.

- `src/activity/activityStore.ts` (modify): add `clearActivities(): Activity[]` that reads the current entries, writes an empty array to `demo.activity`, notifies subscribers, and returns the removed entries; and `restoreActivities(entries: Activity[]): void` that merges the given entries with whatever is currently stored, runs them through the existing `sanitizeActivities` (`src/activity/activityStore.ts:71`) for de-dupe by id, newest-first sort, and the 100 cap, writes the result, and notifies. Both reuse `readStoredActivities` (`src/activity/activityStore.ts:93`) and `writeStoredActivities` (`src/activity/activityStore.ts:118`) so the fail-soft `try`/`catch` behavior and the `MAX_VALID_DATE_TIMESTAMP` bound (`src/activity/activityStore.ts:37`) are inherited rather than duplicated. Both call `notifySubscribers` (`src/activity/activityStore.ts:135`). There is no clear or restore function today.
- `src/activity/ActivityFeed.tsx` (modify): add the `Clear activity` button in the header row next to `<h2 id="activity-feed-title">Recent Activity</h2>` (`src/activity/ActivityFeed.tsx:77`), rendered only when the stored count is at least one (checked against the store, not the 20-item visible slice at `src/activity/ActivityFeed.tsx:6`); add the inline Undo affordance that replaces the empty-state paragraph (`src/activity/ActivityFeed.tsx:85`) while a window is open; add one `role="status"` element; add the UNDO_WINDOW_MS timer using the same own-your-own-timer-id cleanup pattern as the existing interval (`src/activity/ActivityFeed.tsx:65`); add `tabIndex={-1}` to the heading for focus landing on expiry; hold the cleared snapshot in component or module memory only.
- `src/activity/ActivityFeed.css` (modify): style the header row so the heading and Clear button sit on one line, and style the inline Undo affordance, reusing only existing token values (see constraints below).
- Tests (add only): new cases may be added to `src/activity/activityStore.test.ts` and `src/activity/ActivityFeed.test.tsx`, or placed in new sibling files. No existing test may be edited or removed.
- `src/App.tsx` and `src/App.css` are untouched. No backend, no API.

### Query collisions the new UI must avoid

The existing tests, which must stay unmodified, constrain the new markup and copy:

- The empty-state test asserts `document.querySelector('ul')` is null, `document.querySelector('li')` is null, `queryByRole('list')` is null, and `queryAllByRole('listitem')` has length 0 (`src/activity/ActivityFeed.test.tsx:159`). The Undo affordance and the status element therefore must not be a `ul`, `li`, or `role="list"`, and must not render any `listitem`. This is naturally satisfied because in the empty state (no stored entries and no open window) neither the Clear button nor the Undo affordance renders.
- Tests use bare `screen.getByText('settings')` (`src/activity/ActivityFeed.test.tsx:46`, `:64`) and bare `screen.getByText('just now')` (`src/activity/ActivityFeed.test.tsx:48`). New copy must not equal `settings` or `just now`. The chosen strings `Clear activity`, `Undo`, `Activity cleared.`, and `Activity restored.` are all distinct.
- Tests use `screen.getByRole('list')` (`src/activity/ActivityFeed.test.tsx:106`, `:137`), so the new UI must introduce no second list role.
- Tests use `screen.getByRole('button', { name: 'Toggle email notifications' })` (`src/activity/ActivityFeed.test.tsx:54`) and `screen.getByText('On')` (`src/activity/ActivityFeed.test.tsx:60`). The new button names `Clear activity` and `Undo` are distinct from `Toggle email notifications`, and none of the new visible strings equal `On` or `Off`.
- The `records production settings interactions` test (`src/activity/ActivityFeed.test.tsx:51`) renders `<App />`, clicks the toggle, and then asserts the empty-state copy is absent and `settings` plus `Turned email notifications on.` are present. After that click one entry is stored, so the `Clear activity` button will render in that test; its name does not collide with any query in that test, and the `getByRole('button', { name: 'Toggle email notifications' })` lookup still resolves uniquely.
- The `cleans up its subscription on unmount` test (`src/activity/ActivityFeed.test.tsx:143`) spies on `console.error` and asserts it is never called, so the new timer cleanup must not log or throw.

### Constraints for the frontend designer

The frontend designer writes `.sdlc/wf_1788731227559_dowtdh/design/frontend-designer.md`. This spec does not design; it bounds the design.

- Surfaces: Settings page, Activity section only. Reuse only existing tokens: colors `#0f172a`, `#475569`, `#e2e8f0`, `#ffffff`; sizes `0.75rem`, `0.875rem`; the `Inter, system-ui, -apple-system, sans-serif` stack; the `999px` pill radius; the existing `1px` borders (`src/App.css`, `src/activity/ActivityFeed.css`). No new colors, fonts, or icons.
- The `Clear activity` button touch target is at least 24 by 24 CSS px, with 44 px preferred; it sits in the section header row next to the `h2` and must work at 320 px width with no horizontal scroll and at 200% zoom.
- The Undo affordance is inline in the section. No motion is required. If any countdown visual is used it must respect `prefers-reduced-motion` and color must not be the only carrier of meaning.
- Contrast pairs to name: `#475569` on `#ffffff`, `#0f172a` on `#ffffff`, `#ffffff` on `#0f172a`.
- States to specify: default (entries plus Clear), empty (no Clear, standard copy), cleared-with-undo (status plus Undo), restored, storage-failure (visually identical to success), and disabled (none expected; state why).

### Alternatives rejected

- Fixed-position toast overlay for Undo: rejected. The intent asks for an affordance on the feed; an overlay competes with the existing layout at 320 px, can obscure content, and complicates focus management. The Undo affordance is inline, replacing the empty-state paragraph while the window is open (R2).
- Confirmation dialog before clearing: rejected in favor of undo as the safety net, which is what the intent specifies. A confirm dialog plus undo is double friction for a demo feed. Recorded as Concern 2 for the design lead, with the alternative of adding a confirm step named.
- Deferred storage write (write the empty array only at expiry so a reload inside the window brings entries back): rejected. It keeps two sources of truth in sync across a reload and makes "empties it" untrue in storage until the timer fires. This spec commits at click time and keeps the snapshot out of storage entirely. Recorded as Concern 4 for the product owner.
- Persisting the undo snapshot to sessionStorage or localStorage: rejected. It would make the snapshot survive reload, contradicting R4's simple and honest reading, and would add a second storage surface to validate and clean up. The snapshot stays in memory only.
- A "Cleared activity" self-log entry: rejected because it would immediately repopulate the feed the user just emptied (R5).

## Policy answers

### Security

- Which new or changed surfaces (endpoints, tools, queues, webhooks, buckets, tables) does this feature add, and what is the authorizer and authorization rule for each?

None. No endpoint, tool, queue, webhook, bucket, or table is added or changed. The only storage surface is the existing localStorage key `demo.activity` on the user's own device, now also written by `clearActivities` and `restoreActivities`. It is governed by the browser's same-origin policy, not by an application authorizer.

- Is any surface reachable without authentication, and if so why is that unavoidable and who approved it?

N/A: the app has no authentication and adds none. The Settings page is a static client-side page with no server-side surface to reach.

- What user-controlled inputs exist, and how is each validated and protected against injection, XSS, SSRF, and path traversal?

Two. First, the clicks on `Clear activity` and `Undo`, which carry no payload. Second, the contents of `demo.activity`, which the user or a browser extension can edit in devtools; on restore that content flows through the existing `sanitizeActivities` and `isActivity` validation (`src/activity/activityStore.ts:50`, `:71`), which enforces object shape, string types, and the finite timestamp bound of 8.64e15. Nothing derived from storage is interpolated into HTML, a shell command, SQL, or a URL, so there is no injection, XSS, SSRF, or path-traversal path. The undo snapshot is entries the store itself produced, so it needs no separate trust boundary.

- What secrets does the feature need, where do they live, and how do they rotate?

None. No credentials, tokens, or keys are involved.

- What data does the feature store or transmit, how is each field classified, and how is confidential or PII data encrypted at rest and in transit?

It stores nothing new. It adds a deletion mechanism for the existing Activity entries (`id`, `type`, `description`, `timestamp`) and a memory-only snapshot used to restore them. Transmitted: nothing, zero network traffic. Classification: internal, device-local, not tied to any identity because the app has no accounts. Stored in plaintext localStorage, the only client-side persistence option and appropriate for non-sensitive demo data. No KMS applies because nothing leaves the device.

- What can an abusive caller do to run up cost or degrade service, and what limits stop them?

Nothing costs money. There is no server, no metered call, no per-request billing. A local attacker with devtools can write a large value to the key, but the restore path validates and caps at 100 entries (`src/activity/activityStore.ts:85`), and the clear path writes an empty array. The practical ceiling is the browser's own per-origin quota, handled by the fail-soft write (R8). Degrading one's own browser storage is not a service-degradation vector for anyone else.

- What security-relevant events are logged, where, and what is deliberately excluded from logs?

Nothing is logged. No `console` output is added. Clear and restore failures are swallowed silently by design (R8). Deliberately excluded: the raw stored value and the snapshot, which are never logged or echoed, so tampered content cannot reach a log sink or be reflected to the page.

- Which existing controls (roles, gateways, WAF rules, KMS keys) does the feature reuse rather than recreate?

The controls already in `src/activity/activityStore.ts`: the fail-soft `try`/`catch` read and write pattern, the `sanitizeActivities` de-dupe, sort, and cap, and the `MAX_VALID_DATE_TIMESTAMP` (8.64e15) timestamp bound. No new control is invented.

### Compliance

- What personal data is collected, derived, or received, from whom, and what is the legal basis for each purpose?

This feature stores no new field. It adds a deletion mechanism for the existing `demo.activity` entries. Data inventory:

| Field | Source | Purpose | Storage | Special category | Legal basis |
| --- | --- | --- | --- | --- | --- |
| `id`, `type`, `description`, `timestamp` (existing Activity entries) | The user's own actions on the Settings page | Show a recent-activity history; now also allow the user to clear and briefly undo | Browser localStorage on the user's own device only | No | The user's own explicit action; legitimate interest for a device-local activity log the user controls |
| undo snapshot (a copy of the cleared entries) | Held only in component or module memory during the five second window | Restore exactly what was cleared if the user chooses Undo | Memory only, never written to storage or transmitted | No | Same as above; transient and never persisted |

Because the app has no accounts and stores nothing that identifies a person, these are arguably not personal data at all; they are a device-local log. The answers below are given on that basis rather than asserting a stricter regime than the facts support.

- Where and when does the user learn about this processing and, where consent is the basis, give and withdraw it?

At the feed itself. The `Clear activity` control is the disclosure and the action in one gesture, and `Undo` reverses it for five seconds. Consent is not the legal basis relied on, so no separate consent prompt or withdrawal flow is required.

- How long is each field kept, what deletes it, and does deletion reach backups, logs, analytics, and vendors?

Existing entries are kept until the 100 cap drops the oldest, until the user clears the feed with the new control, or until the user clears site data. This feature is itself a deletion path: `Clear activity` removes all entries from storage at click time. The undo snapshot is dropped when the window expires. Deletion reach is trivially complete: there are no backups, no logs (nothing is logged), no analytics, and no vendors, because the data never leaves the device.

- How does a user access, correct, delete, or export this data, and which team or system fulfils the request within the deadline?

The user has direct and complete control through their own browser (devtools or the clear-site-data control), and now additionally through the in-app `Clear activity` control. No team or ticketing system is involved because no copy exists anywhere else. Formal data-subject request handling does not attach to data that is not linked to an identifiable person and never reaches the operator.

- Which third parties, including AI/LLM providers, receive personal data, under what agreement, and in which region?

None. No processors, sub-processors, vendors, or AI or LLM provider receive anything. The feature makes zero network calls.

- Does personal data leave the user's jurisdiction, and if so under which transfer mechanism?

No. Nothing leaves the device, so no cross-border transfer occurs and no transfer mechanism is needed.

- Could minors use this feature, and how is that handled?

Possibly, since the demo has no audience gating. The handling is that the stored data does not identify anyone, is not used for profiling or advertising, and never leaves the device, so a minor clearing or undoing the feed creates no additional risk over an adult doing so. No age gate is proposed.

- Which compliance documents (ROPA, DPIA, privacy policy, cookie notice, DPA) need updating before launch, and who owns each update?

None required, in this spec author's assessment: a device-local, non-identifying activity log in a demo app, to which this change only adds a deletion mechanism, does not create a new processing activity for a ROPA, does not meet a DPIA threshold, involves no processor needing a DPA, and is not a cookie. Stated as an assessment and deferred to the compliance lead if they wish to review.

### Brand

- Which brand-kit version or object date did you read, and which voice and tone attributes did you apply?

None. The brand kit at `branding-kit/brand-system.md` does not exist in the artifact bucket and the prefix is empty. No brand values were invented to fill the gap. Raised as Concern 1. In its absence the tone applied is the tone already present in the shipped UI: short, plain, sentence case, no exclamation marks, as in "No recent activity yet. Actions you take will show up here."

- What new names (features, screens, tiers, tools, commands) does the spec introduce, and is each approved or proposed?

Two user-visible labels come from the intent verbatim: `Clear activity` and `Undo`. They are the intent's own words but are still unapproved by any brand kit, so they are marked proposed. The status strings `Activity cleared.` and `Activity restored.` are new copy, also proposed. All are sentence case, plain punctuation, no em dash, no emoji, no exclamation mark.

- Which visual tokens (color, type, spacing, icon set) does the feature use, and are any outside the kit?

Only values already present in `src/App.css` and `src/activity/ActivityFeed.css`: `#0f172a`, `#475569`, `#e2e8f0`, `#ffffff`; `0.75rem` and `0.875rem`; the `Inter, system-ui, -apple-system, sans-serif` stack; the `999px` pill radius; the existing `1px` borders. No new hex value, font, size, or icon is introduced, and no icon set is used. Whether those raw values match approved tokens could not be verified without the kit (Concern 1).

- Do any logos or third-party marks appear, and in which approved form?

No. No logo, wordmark, or third-party mark appears anywhere in the change.

- What claims does the copy make, and what evidence supports each?

The status strings state facts about what just happened (`Activity cleared.`, `Activity restored.`), each backed by the store operation that produced it. No performance, comparative, or promotional claim is made.

- Which disclosures or labels (beta, AI-generated, pricing) does the feature require, and where do they appear?

None. Nothing here is beta-gated, AI-generated, or priced.

- What are the channel constraints for each message surface (UI, push, email, chat, Telegram), and does the sample copy fit them?

UI only. No push, email, chat, or Telegram surface is touched. The constraint is the Settings card width at 320 px. The longest new string is `Activity cleared.` at about 17 characters and `Clear activity` at 14 characters; both fit within the section without horizontal scroll. String lengths at 320 px are a designer check.

- Which domain terms does the spec introduce, and does the glossary hold exactly one term per concept?

One term per concept, used consistently: Activity feed (the existing Recent Activity section), entry (one stored activity object), Clear control (the `Clear activity` button), Undo affordance (the inline `Undo` button and its status), undo window (the five second UNDO_WINDOW_MS interval), snapshot (the memory-only copy of cleared entries used to restore). No synonyms are used for any of them.

### UX

- For each new screen or component, what does the user see and do in the loading, empty, error, partial, success, and disabled states?

Three new elements: the Clear control, the inline Undo affordance, and the status element. Loading: N/A, storage reads are synchronous, so no spinner. Empty (no stored entries and no open window): no Clear control, no Undo, the standard empty copy shows (R1, R3). Default and success (entries stored): the Clear control shows; after a clear the status announces and the Undo affordance shows; after undo the entries and Clear control return. Error and degraded (storage throws): visually identical to success, the in-memory list still updates and no error UI appears (R8). Partial: N/A, clear writes an empty array and restore writes one sanitized array, so there is no half-written state. Disabled: none expected, because the Clear control is simply absent when there is nothing to clear and the Undo button exists only while it is actionable, so a disabled state would represent nothing real.

- How does a keyboard-only user complete every task in the feature, and where does focus go after each modal, deletion, or navigation?

Both actions are native buttons reachable by Tab and activated by Enter or Space. After Clear, focus moves to the Undo button. After Undo, focus moves to the Clear button, which has reappeared. If the window expires while Undo holds focus, focus moves to the `Recent Activity` heading (given `tabIndex={-1}`) so focus is never dropped to `document.body` (R6). There is no modal and no navigation.

- Which color token pairs are used for text and controls, and do they meet AA contrast in every supported theme?

`#475569` on `#ffffff` (roughly 7.5:1) for secondary text and the status line, `#0f172a` on `#ffffff` for primary text, and `#ffffff` on `#0f172a` for the pressed or filled control state. All are existing pairs used elsewhere in the page and pass AA. There is a single light theme; no dark theme exists to check. The designer confirms the final contrast pairs.

- What is announced to screen readers (VoiceOver, NVDA, TalkBack) for images, icon buttons, live regions, and state changes?

A single `role="status"` element (implicitly polite) announces `Activity cleared.` on clear and `Activity restored.` on undo, and announces nothing on expiry (R7). The `Clear activity` and `Undo` buttons announce their accessible names. There are no images or icon buttons. The existing `aria-live="polite"` on the feed list is unchanged. The spec deliberately does not move focus into the live region and does not add `aria-live` to the Undo button itself; that choice is recorded as Concern 5.

- What happens at 320 px width, at 200% zoom, and at the largest Dynamic Type size?

At 320 px the header row keeps the heading and Clear button on one line without horizontal scroll (a designer constraint), and the inline Undo affordance is a full-width region beneath the heading, so it does not compete for horizontal space. At 200% zoom text reflows within the `max-width: 640px` container with nothing clipped. At the largest type size rem-based sizing scales and content wraps rather than overflowing.

- What motion does the feature use, and what does it do when reduced motion is requested?

None is required. If the designer adds a countdown visual it must respect `prefers-reduced-motion` and must not use color as the only carrier of meaning. The base spec adds no animation, transition, or transform.

- Which actions are destructive or irreversible, and how are they confirmed and undone?

`Clear activity` is destructive: it removes all entries. It is not gated by a confirmation dialog; the five second Undo affordance is the safety net the intent specifies (Concern 2). After the window expires the clear is irreversible, which is the intended permanence (R3, R4).

- Does any flow involve choosing, paying, cancelling, or declining, and how does the spec show it is free of dark patterns?

Choosing only, no payment, cancellation, or decline flow. It is free of dark patterns because the Clear and Undo controls carry equal, plain-labeled weight with no persuasive or shaming copy, the destructive action is reversible for five seconds, and the status copy states a neutral fact rather than nudging the user toward or away from clearing.

## Concerns

| # | Concern | Policy | Owner | Proposed resolution | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Brand rules 1 and 2: the brand kit object `branding-kit/brand-system.md` is missing and the prefix is empty, so the labels `Clear activity` and `Undo`, the status strings `Activity cleared.` and `Activity restored.`, and the reuse of existing raw CSS values (`#0f172a`, `#475569`, `#e2e8f0`, `#ffffff`, `0.75rem`, `0.875rem`, `999px`) could not be checked against approved vocabulary or tokens. | Brand | human:brand-lead | Approve the labels and status strings as written (the labels are the intent's own words) and the existing values as-is. Alternative: publish the kit and re-check before Plan Approval. | open |
| 2 | UX rule 14: a destructive action without an explicit confirmation dialog; the intent specifies undo as the safety net instead of a confirm step. | UX | human:design-lead | Accept undo-only, because a confirm dialog plus undo is double friction for a demo feed and the intent asks for undo. Alternative: add a confirm step that names the object being cleared. | open |
| 3 | UX rule 12: the Undo affordance auto-dismisses after 5000 ms and is not also available in a persistent location, which is inherent to an undo window. | UX | human:design-lead | 5000 ms meets the rule's five second floor; the designer may pause the countdown while Undo has focus or hover. Alternative: lengthen the window to 8 seconds. | open |
| 4 | Intent ambiguity on reload inside the window (R4): "after that the clear is permanent and survives reload" could be read as implying that a reload inside the five second window is not yet permanent. This spec commits the clear to storage at click time, so a reload inside the window loses the ability to undo. | UX and intent | human:product-owner | Commit at click time; a reload inside the window is permanent (simplest and honest, the snapshot never touches storage). Alternative: defer the storage write until expiry so a reload inside the window brings entries back. | open |
| 5 | Intent ambiguity: "Keyboard and screen-reader users can do both" is satisfied by native buttons plus a `role="status"` element; the spec chooses not to move focus into a live region and not to add `aria-live` to the Undo button itself. | UX | human:design-lead | Accept as specified: focus lands on real interactive controls and the status region announces state changes, which covers both audiences without duplicating announcements. Alternative: move focus into the live region on clear. | open |
| 6 | Concurrency ambiguity: if a store change arrives during the open window (for example a new entry from the Email notifications toggle), the Clear button reappears and a second Clear must merge into the existing snapshot and restart the window (R5), which is behavior this spec defines rather than the intent. | UX and correctness | human:product-owner | Accept the merge-and-restart behavior so a subsequent Undo restores everything cleared. Alternative: disallow a second Clear while a window is open. | open |

## Test plan

Automated, with `vitest` and `@testing-library/react` in the existing jsdom environment. Every new suite calls `localStorage.clear()` in `beforeEach` and resets timers with `vi.useRealTimers()`, matching `src/activity/activityStore.test.ts:14` and `src/activity/ActivityFeed.test.tsx:20`. Fake timers use `vi.useFakeTimers()` with `vi.setSystemTime`, and window advances use `act(() => vi.advanceTimersByTime(5000))`. A reload is simulated by `unmount()` followed by a fresh `render(...)`, which is faithful because the clear and restore commit to localStorage and the feed reads storage on mount.

| Req | Test file | What the test does |
| --- | --- | --- |
| R1 | `src/activity/activityStore.test.ts` | Seeds several entries, calls `clearActivities()`, asserts the return value equals the removed entries newest-first, asserts `getActivities()` is now `[]`, and asserts the raw `demo.activity` value is an empty array. |
| R1 | `src/activity/ActivityFeed.test.tsx` | With entries seeded, renders the feed, asserts `getByRole('button', { name: 'Clear activity' })` is present; with storage empty, asserts `queryByRole('button', { name: 'Clear activity' })` is null and the standard empty copy shows. |
| R1 | `src/activity/ActivityFeed.test.tsx` | Seeds more than 20 entries, clicks `Clear activity`, asserts the list is gone, `getActivities()` is `[]`, and `document.querySelector('li')` is null, proving all stored entries (not only the 20 visible) were removed. |
| R2 | `src/activity/activityStore.test.ts` | Calls `restoreActivities(entries)` with a snapshot plus a stored entry that overlaps by id, asserts the result is de-duplicated by id, sorted newest-first, and capped at 100. |
| R2 | `src/activity/ActivityFeed.test.tsx` | Under fake timers, seeds entries, clicks `Clear activity`, asserts the `Undo` button and `Activity cleared.` status show; clicks `Undo`, asserts the exact same entries render in the same order and the Undo affordance is gone. |
| R2 | `src/activity/ActivityFeed.test.tsx` | Asserts UNDO_WINDOW_MS is honored: after clear, advancing timers by 4999 ms with `act(() => vi.advanceTimersByTime(4999))` still shows Undo, and one more ms removes it. |
| R3 | `src/activity/ActivityFeed.test.tsx` | Under fake timers, after clear runs `act(() => vi.advanceTimersByTime(5000))`, asserts the Undo affordance is gone, the standard empty copy has returned, and a subsequent programmatic restore of the dropped snapshot is not offered (no Undo button). |
| R3 | `src/activity/ActivityFeed.test.tsx` | Renders the feed, clears, unmounts, and asserts no console error and no timer callback fires after unmount (spy on `console.error` as in `src/activity/ActivityFeed.test.tsx:143`). |
| R4 | `src/activity/ActivityFeed.test.tsx` | Clears, then simulates reload by `unmount()` plus a fresh `render(...)` while still inside the window, asserts the empty feed with no Undo button; separately, clears then undoes, reloads, and asserts the restored entries render. |
| R5 | `src/activity/ActivityFeed.test.tsx` | Records `getActivities().length` around clear and around undo and asserts neither writes an entry; adds an entry during the open window via `act(() => addActivity('settings', '...'))`, asserts it appears and the Clear button is available again; clicks Clear a second time and then Undo and asserts everything cleared across both clears is restored and the window had restarted. |
| R6 | `src/activity/ActivityFeed.test.tsx` | Activates Clear with a keyboard event (Enter and Space in separate assertions), asserts focus is on the Undo button; activates Undo, asserts focus is on the Clear button; sets focus on Undo and advances timers past the window, asserts focus is on the `Recent Activity` heading. |
| R7 | `src/activity/ActivityFeed.test.tsx` | Asserts the status element resolves by `getByRole('status')`, reads `Activity cleared.` after clear and `Activity restored.` after undo, is not a `ul`/`li`/`role="list"`, and that the existing `aria-live="polite"` on the list is unchanged; asserts nothing new is announced on expiry. |
| R8 | `src/activity/activityStore.test.ts` | `vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })`, asserts `clearActivities()` and `restoreActivities(...)` do not throw and still notify subscribers; a matching `getItem` spy covers the read side. |
| R8 | `src/activity/ActivityFeed.test.tsx` | With `setItem` throwing, clicks Clear and asserts the list still empties in memory, the Undo affordance still shows, and no error text is rendered. |
| R9 | CI and review | `npm test` (all suites, existing ones unmodified), `npm run lint` (`tsc --noEmit`), `npm run build` (`tsc -b && vite build`). Reviewer confirms `package.json` and `package-lock.json` dependency sections are unchanged, `src/App.tsx` and `src/App.css` are byte-identical, and no `DEPLOY.md` was created. |
| R10 | Itself | The rows above are the coverage R10 requires: clear returns and empties, restore merges/dedupes/sorts/caps, both fail soft and both notify, plus the component-level clear, undo, expiry, reload, hidden-when-empty, added-during-window, second-clear-merge, keyboard, focus, and no-self-log cases. |

Query collision note for the implementer: the existing suite (`src/activity/ActivityFeed.test.tsx`) asserts `document.querySelector('ul')`/`('li')` null and `queryByRole('list')` null in the empty state, and uses bare `getByText('settings')`, `getByText('just now')`, `getByRole('list')`, and `getByRole('button', { name: 'Toggle email notifications' })`. The new UI must not render a second list role, must not use copy equal to `settings` or `just now`, and must keep the empty state free of `ul`/`li`. The Clear button and Undo affordance appear only when entries are stored or a window is open, so the empty-state assertions are unaffected. New tests should scope queries with `within(...)` on the Activity section when a relative label or role might otherwise be ambiguous.

Manual and visual QA: verify in a real browser at 320 px and 1280 px viewport width; keyboard operation with Tab, Enter, and Space for both Clear and Undo, and focus landing after each; a hard reload both inside the five second window (empty feed, no Undo) and after the window (empty feed) and after an undo (entries restored). Screenshots saved under `docs/` following the existing `docs/TEAM-<n>-*.png` convention, using TEAM-4162 (for example `docs/TEAM-4162-clear.png`, `docs/TEAM-4162-undo.png`, `docs/TEAM-4162-narrow.png`). This spec only names the artifacts; the implementer or QA produces them.

## Out of scope

From the intent, verbatim: Per-entry delete, filtering or search, syncing history to a server.

Additionally out of scope for this spec:

- Cross-tab sync via the `storage` event.
- Persisting the undo snapshot (sessionStorage or otherwise); the snapshot is memory-only.
- A confirmation dialog before clearing.
- Any change to `src/App.tsx` or `src/App.css`.
- Any change to `DEPLOY.md`, which does not exist and is not created.

## Build plan

The repository is not CD-registered, so the chain ends at CI. There is no Ship, Merge, or CD step; the orchestrator opens the PR for the owning team.

1. Spec Approval (human:product-owner), blocked by TEAM-4164 (this spec ticket).
2. Design: Frontend (agentcore_hub_frontend_designer), blocked by Spec Approval; commits `.sdlc/wf_1788731227559_dowtdh/design/frontend-designer.md` and mockups on the branch.
3. Design Approval (human:product-owner), blocked by the frontend designer ticket.
4. Plan (agentcore_hub_frontend_dev), blocked by Design Approval; writes `.sdlc/wf_1788731227559_dowtdh/plan.md` only.
5. Plan Approval (human:engineer), blocked by Plan.
6. Implement: frontend (agentcore_hub_frontend_dev), blocked by Plan Approval.
7. Review (agentcore_hub_code_reviewer), blocked by Implement; commits `findings.md`.
8. QA (agentcore_hub_qa_verifier), blocked by Review.
9. CI (agentcore_hub_ci_agent), blocked by QA. Chain ends; the orchestrator opens the PR for the owning team.

Roles deliberately not created (default deny):

- No backend designer: there is no server, endpoint, queue, or schema; the change is client-side localStorage only.
- No security reviewer ticket: no new surface, secret, authorization, or network path; the store's existing fail-soft and validation controls are reused unchanged.
- No legal or compliance agent ticket: the feature stores no new field and only adds a deletion mechanism for device-local, non-identifying data; no ROPA, DPIA, or DPA is triggered.
- No localization ticket: the app ships a single locale and this change adds only a few English UI strings with no localization framework in place.
- No analytics designer ticket: no events are tracked, logged, or transmitted.
- No iOS or Android designer ticket: this is a web app with no native surface.
- No backend dev or API dev ticket: there is no backend or API to build; all logic is in the existing client store and component.
