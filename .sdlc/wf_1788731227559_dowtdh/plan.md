# Plan: Clear the Activity feed with an undo window
- Workflow: wf_1788731227559_dowtdh / Epic: TEAM-4162 / Plan ticket: TEAM-4177 / Spec commit: b7b40187 / Design doc: .sdlc/wf_1788731227559_dowtdh/design/frontend-designer.md / Author: agentcore_hub_frontend_dev / Status: proposed

## Approach

Build the spec's Design and the designer's DOM/CSS into the existing store and feed component. No new module, no new dependency, no backend. Ordered steps:

### (a) `src/activity/activityStore.ts` — two new exported functions

Add both functions after `addActivity`, reusing the existing private helpers so the fail-soft `try`/`catch` (`readStoredActivities` :93, `writeStoredActivities` :118), the `sanitizeActivities` de-dupe/sort/cap (:71), and the `MAX_VALID_DATE_TIMESTAMP` bound (:37) are inherited, never duplicated.

- `export function clearActivities(): Activity[]` — `const removed = readStoredActivities()` (already sanitized, newest-first); `writeStoredActivities([])`; `notifySubscribers()` (:135); `return removed`. The return is exactly the removed entries, newest-first, matching R1's "returns the removed entries".
- `export function restoreActivities(entries: Activity[]): Activity[]` — `const merged = sanitizeActivities([...entries, ...readStoredActivities()])` (snapshot first so on an id collision the snapshot entry wins under sanitize's keep-first-occurrence rule, matching R2's "same ids"); `writeStoredActivities(merged)`; `notifySubscribers()`; `return merged`.

**Return type deviates from spec deliberately.** The spec's Design brief (line 98) types `restoreActivities(entries): void`. This plan returns the sanitized `Activity[]` instead so the component can keep its in-memory list correct when a storage write fails (see R8 below). The signature is a strict superset: any `void` caller is unaffected. Tracked as Concern 10.

### (b) `src/activity/ActivityFeed.tsx` — Clear button, undo affordance, status, timer, focus

Module constant: `const UNDO_WINDOW_MS = 5000`.

State (added to the existing `activities` / `now`): `isWindowOpen: boolean`, `statusMessage: '' | 'Activity cleared.' | 'Activity restored.'`, `undoWindowKey: number` (incremented on each clear to restart the timer effect).

Refs: `undoSnapshotRef: Activity[] | null` (memory-only snapshot, `useRef<Activity[] | null>(null)`), `clearButtonRef: useRef<HTMLButtonElement>(null)`, `undoButtonRef: useRef<HTMLButtonElement>(null)`, `headingRef: useRef<HTMLHeadingElement>(null)`, `pendingFocusRef: useRef<'undo' | 'clear' | null>(null)`.

Follow the designer's DOM skeleton (frontend-designer.md lines 380–422) exactly:
- header `div.activity-feed__header` containing `<h2 id="activity-feed-title" className="activity-feed__title" tabIndex={-1} ref={headingRef}>Recent Activity</h2>` and, only when `hasStoredEntries`, the `<button type="button" className="activity-feed__button" ref={clearButtonRef} onClick={handleClear}>Clear activity</button>`.
- always-mounted `div` with class `activity-feed__notice` plus `activity-feed__notice--active` when `isNoticeActive` (`statusMessage !== '' || isWindowOpen`), containing `<p role="status" className="activity-feed__status">{statusMessage}</p>` and, only when `isWindowOpen`, the `<button ... ref={undoButtonRef} onClick={handleUndo}>Undo</button>`.
- body slot: `hasStoredEntries ? <ul className="activity-feed__list" aria-live="polite"> … </ul> : !isWindowOpen ? <p className="activity-feed__empty">No recent activity yet. Actions you take will show up here.</p> : null`. The empty paragraph is suppressed while the window is open (satisfies R2 "replaces the empty-state paragraph").

`const hasStoredEntries = activities.length > 0`. This equals "stored count >= 1" because `getVisibleActivities()` is `getActivities().slice(0, 20)` and `slice(0, 20)` of a non-empty array is non-empty; so no second store read is needed to gate the Clear button. The existing `ul aria-live="polite"` is unchanged (R7).

**TIMER (R3):** implement as an effect that owns its own id, mirroring the existing `REFRESH_INTERVAL_MS` interval pattern (ActivityFeed.tsx:65):
```
useEffect(() => {
  if (!isWindowOpen || isPaused) return
  const id = setTimeout(closeWindow, UNDO_WINDOW_MS)
  return () => clearTimeout(id)
}, [isWindowOpen, undoWindowKey, isPaused, closeWindow])
```
This is the spec's R3 "each effect invocation owns and clears its own timer id" pattern: StrictMode-safe (double-invoke creates and clears its own id) and it cleans up on unmount for free (no callback fires after unmount). The designer's sketch used an imperative `timerRef`; **we follow the spec's effect-owned pattern instead** — the visible behavior is identical, and `undoWindowKey++` on a second clear re-runs the effect so the window restarts. The `isPaused` dependency is the hover-pause (Deviations D1, D5): the same own-and-clear property means `pointerleave` starts a fresh `UNDO_WINDOW_MS` for free. The delay stays the `UNDO_WINDOW_MS` constant, which is how the unmount test identifies this timer.

**R8 in-memory consistency (critical — verified against the code).** The existing subscriber does `setActivities(getVisibleActivities())` (ActivityFeed.tsx:57), i.e. it RE-READS localStorage on every notification. If `setItem` throws during clear, storage still holds the old entries, so the pub/sub re-read would re-render them and the list would NOT empty — the R8 component test ("with setItem throwing, clicks Clear and asserts the list still empties in memory, the Undo affordance still shows") would fail. Therefore:
- `handleClear` calls `const removed = clearActivities()` then `setActivities([])` itself (last).
- `handleUndo` calls `setActivities(restoreActivities(snapshot).slice(0, MAX_VISIBLE_ACTIVITIES))`.

Ordering guarantee: `clearActivities()`/`restoreActivities()` run `notifySubscribers()` synchronously, so the subscriber's `setActivities(getVisibleActivities())` is queued first; the handler's own `setActivities(...)` is queued last. Both queued setState calls run inside the same React event batch, so the handler's value wins. On the success path both values are identical (`[]` for clear; `merged.slice(0,20)` equals the fresh read for undo); only on write failure does the handler's value differ and correctly hold the in-memory truth. This is why `restoreActivities` returns the sanitized list (Concerns 10, 11).

**handleClear:** `const removed = clearActivities()`; `undoSnapshotRef.current = [...removed, ...(undoSnapshotRef.current ?? [])]` (second-clear merge, newest clear first); `setActivities([])`; `setStatusMessage('Activity cleared.')`; `setIsWindowOpen(true)`; `setUndoWindowKey(k => k + 1)` (restart timer); `pendingFocusRef.current = 'undo'`.

**handleUndo:** `const snapshot = undoSnapshotRef.current`; if it is null or empty, `closeWindow()` and return (Deviation D4 — nothing to restore, so do not announce a restore); otherwise `const merged = restoreActivities(snapshot)`; `undoSnapshotRef.current = null`; `setActivities(merged.slice(0, MAX_VISIBLE_ACTIVITIES))`; `setIsWindowOpen(false)`; `setStatusMessage('Activity restored.')`; `setPendingStatus(null)`; `setIsPaused(false)`; `pendingFocusRef.current = 'clear'`. Setting `isWindowOpen=false` tears down the timer effect (cleanup clears the timeout).

**handleExpire (timer callback) — implemented as the shared `closeWindow()`:** read `const undoHadFocus = document.activeElement === undoButtonRef.current` FIRST (before any state update unmounts the button); then `undoSnapshotRef.current = null`; `setIsWindowOpen(false)`; `setStatusMessage('')` (removing text announces nothing — R7); `setPendingStatus(null)` and `setIsPaused(false)`; if `undoHadFocus`, `headingRef.current?.focus()` (the heading is always mounted, so this is safe synchronously). Also called by `handleUndo` on an empty snapshot (Deviation D4).

**FOCUS effect:** `useEffect(() => { const target = pendingFocusRef.current; if (!target) return; pendingFocusRef.current = null; if (target === 'undo') undoButtonRef.current?.focus(); else clearButtonRef.current?.focus() }, [isWindowOpen, hasStoredEntries])`. The dep list changes exactly when the target button mounts (`isWindowOpen` for Undo, `hasStoredEntries` for Clear after undo). RTL's `fireEvent`/`act` flushes effects, so `toHaveFocus()` assertions in the R6 tests are synchronous.

**Second clear during an open window:** handled by handleClear's merge + `setUndoWindowKey(k => k + 1)`. The status must also re-announce, and re-setting the identical `'Activity cleared.'` string is not a DOM mutation, so live regions stay silent (review F2b). So handleClear re-announces in two steps **only when the status already reads `'Activity cleared.'`**: set `''` synchronously, then re-set `'Activity cleared.'` on the next tick from an effect-owned `setTimeout(…, 0)` keyed on a `pendingStatus` state. Every other transition (first clear, or a clear right after an undo when the text reads `'Activity restored.'`) already changes the text, so it stays synchronous — which is what the existing tests assert. The pending re-set is cancelled by Undo, by expiry and by unmount (all null `pendingStatus`, and the effect cleanup clears its id). `isNoticeActive` stays true across the blank tick because `isWindowOpen` is true, so the row does not collapse and reflow. No new copy. (Deviation D3.)

**Hover-pause (PO Concern 3):** `isPaused` state, set by `onPointerEnter`/`onPointerLeave` on the notice row, is a third dependency of the timer effect, which returns early when `!isWindowOpen || isPaused`. Because each invocation clears its own id, `pointerleave` starts a FRESH `UNDO_WINDOW_MS` rather than resuming the remainder — no elapsed-time bookkeeping. `handleClear`, `handleUndo` and `closeWindow` all reset the flag. A focus-pause is deliberately not implemented (Deviation D1). (Deviations D1, D5.)

**closeWindow (shared expiry path):** the expiry logic is a single `closeWindow()` — read `undoHadFocus` first, then null the snapshot, `setIsWindowOpen(false)`, `setStatusMessage('')`, `setPendingStatus(null)`, `setIsPaused(false)`, and focus the heading if Undo had focus. It is used both by the timer callback and by `handleUndo` when the snapshot is null/empty, so an Undo with nothing to restore closes the window instead of announcing a restore that did not happen (Deviation D4).

No Activity entry is written by clear or undo (R5). No `console` output anywhere (R8, and the `console.error` spy test at line 143 must stay green).

### (c) `src/activity/ActivityFeed.css` — append the designer's block verbatim

Append the ready-to-paste CSS block from frontend-designer.md lines 289–376 verbatim: `.activity-feed__header`, `.activity-feed__header .activity-feed__title`, `.activity-feed__title:focus`, `.activity-feed__button` (+ `:hover, :active`, `:focus-visible`), `.activity-feed__notice`, `.activity-feed__notice--active`, `.activity-feed__status`, `.activity-feed__status:empty`. Only existing token values are used, plus the two flagged numerics: `min-height: 2.75rem` (44 px target) and `2px` outline width/offset (designer Concern 9). The existing `@media (max-width: 400px)` block is left untouched.

### (d) Tests — append only, never edit an existing test

- `src/activity/activityStore.test.ts`: append a new `describe('clearActivities / restoreActivities', ...)` block. The existing top-level `describe('activity store', ...)` already does `localStorage.clear()` + `vi.useRealTimers()` in its own `beforeEach`; a sibling `describe` needs its own identical `beforeEach`. No existing test or setup is touched.
- `src/activity/ActivityFeed.test.tsx`: append a new `describe('Clear activity + undo window', ...)` block with its own `beforeEach`/`afterEach` mirroring lines 20–27. The file already imports `act, fireEvent, render, screen, within` and `addActivity`; the new block additionally needs `getActivities`, `clearActivities`, `restoreActivities` from `./activityStore` — **importing more symbols from an already-imported module is an added import line, not an edit to an existing test**, so it is allowed; if a reviewer prefers zero change to the existing import line, put the new suite in a new sibling file `src/activity/ActivityFeed.clear.test.tsx` with its own imports. Recommendation: append to the existing files (simpler, matches the "new cases may be added to the existing files" allowance in the spec Design brief line 101). Decision recorded in Open questions (4)/Concerns if appending proves to require touching setup.

### (e) Verification commands

`npm test` (vitest run — all suites, existing unmodified and passing), `npm run lint` (`tsc --noEmit`), `npm run build` (`tsc -b && vite build`). Then: `git diff --stat` touches only the four source/test files plus plan.md (and docs/ screenshots at implement time); `git diff --quiet -- src/App.tsx src/App.css` (byte-identical, R9); `git diff -- package.json package-lock.json` shows no dependency change; confirm no `DEPLOY.md` exists.

### (f) Visual evidence (implementation ticket)

Screenshots at 320 px and 1280 px saved under `docs/`, following the existing `docs/TEAM-<n>-*.png` convention (e.g. `docs/TEAM-3649-empty-state.png`): `docs/TEAM-4162-clear.png`, `docs/TEAM-4162-undo.png`, `docs/TEAM-4162-narrow.png`. `docs/` screenshots ARE an allowed file touch for the implementation ticket (the convention already exists and the spec Test plan names these artifacts); they are produced at implement/QA time, not in this plan step. Listed in Files.

## Files

| Path | Change (add/modify/delete) | Why |
| --- | --- | --- |
| `src/activity/activityStore.ts` | modify | Add exported `clearActivities()` and `restoreActivities()` reusing existing private helpers (R1, R2, R8). |
| `src/activity/ActivityFeed.tsx` | modify | Add Clear button, inline Undo affordance, `role="status"`, effect-owned timer, focus management (R1–R8). |
| `src/activity/ActivityFeed.css` | modify | Append the designer's header/button/notice/status CSS block verbatim. |
| `src/activity/activityStore.test.ts` | modify (append new `describe` only) | Store unit tests for clear/restore (R1, R2, R8, R10). |
| `src/activity/ActivityFeed.test.tsx` | modify (append new `describe` only) | Component tests for clear/undo/expiry/reload/keyboard/focus/no-self-log (R1–R8, R10). |
| `.sdlc/wf_1788731227559_dowtdh/plan.md` | add (this file) | The plan; also carries the Deviations log. |
| `docs/TEAM-4162-clear.png`, `docs/TEAM-4162-undo.png`, `docs/TEAM-4162-narrow.png` | add (implement/QA ticket) | Visual evidence at 1280 px and 320 px per spec Test plan and docs/ convention. |
| `.sdlc/wf_1788731227559_dowtdh/spec.md` | modify (review-fix ticket) | Record the PO's TEAM-4174 resolutions in the `## Concerns` table (Concern rows only; nothing else in the spec changes). |
| `docs/TEAM-4183-hover-pause.png` | add (review-fix ticket) | Visual evidence for the hover-pause: cleared state with the pointer on the Undo pill showing the hover fill. |

Files that MUST NOT change: `src/App.tsx`, `src/App.css` (R9, byte-identical), `package.json`, `package-lock.json` (R9, no dependency change). Also unchanged: every existing test case, `DEPLOY.md` (must not be created).

## What could this break?

- **Existing store callers** — `App.tsx` imports only `addActivity`; `ActivityFeed.tsx` imports `getActivities, subscribe`; the two test files import `addActivity, getActivities, subscribe` (grepped). New exports are additive; no existing import breaks. *Mitigation: additive-only API.*
- **pub/sub re-read vs local setState race (R8)** — the subscriber re-reads storage on notify; on a failed write it would resurface stale entries. *Mitigation: handler's own `setActivities` is queued last in the same batch and wins.* On the next `addActivity` after a failed clear, the store re-reads storage (still holding the old entries) and prepends the new one, so old entries resurface — this is the accepted "persistence degraded" behavior of R8/R9 (no error UI, no throw).
- **StrictMode double effects** — timer effect, focus effect, and the existing subscription+interval effect all double-invoke in dev. *Mitigation: each owns and clears its own id/subscription (timer via effect cleanup; focus effect is idempotent because it nulls `pendingFocusRef` on run).*
- **Timer after unmount** — *Mitigation: the effect's cleanup `clearTimeout(id)` runs on unmount; no callback fires late.*
- **Second-clear timer restart** — *Mitigation: `undoWindowKey++` changes the effect dep, so the old timeout is cleared and a fresh `UNDO_WINDOW_MS` starts.*
- **Focus when Undo unmounts on expiry** — reading `document.activeElement` after `setIsWindowOpen(false)` would be too late. *Mitigation: read `undoHadFocus` before any state update; heading stays mounted so `.focus()` is safe.*
- **Hiding the live region while empty** — a `display:none` live region is not in the accessibility tree, so it enters the tree in the same mutation as its first text and the announcement can be missed. This is what the original `:empty { display: none }` rule did, and "mounted but display-toggled" was not a mitigation — mounted-but-hidden **is** the failure (review F2). *Resolution: the rule is gone (Deviation D2). The `<p role="status">` is always mounted **and** always rendered, so the region pre-exists every text change. No layout cost: an empty `<p>` with `margin: 0` generates no line box, so the notice row measures 0 px tall when idle (measured in Chromium). If a future change gives it intrinsic height, add `min-height: 0` rather than hiding it — never `display: none`, `visibility: hidden` or `aria-hidden`.*
- **Hover-pause making the window unbounded** — a pause that is entered but never left would stop the window from ever expiring. Two ways that could happen: a stale flag (the Undo button unmounts under the cursor on click, so no `pointerleave` is delivered) and an idle hover (pointer resting on the notice row before any Clear). *Mitigation: `handleClear`, `handleUndo` and `closeWindow` all reset `isPaused`, so no window inherits a pause; and while no window is open the timer effect has nothing to tear down, making an idle hover inert. Both are covered by tests (`a stale hover pause does not leak into the next window`, `hovering the notice row while no window is open has no effect`). A pause held by a pointer that genuinely stays on the row is intended behaviour per the PO's Concern 3 decision.*
- **`.settings__section h2` margin override specificity** — verified: `.settings__section h2` is (0,1,1) with `margin: 0 0 0.5rem` (App.css:29–34); `.activity-feed__header .activity-feed__title` is (0,2,0) with `margin: 0`, which wins regardless of stylesheet order, and `.activity-feed__header` supplies `margin-bottom: 0.5rem` so list/empty spacing below the heading is unchanged.
- **Existing-test query collisions** — all verified against the real test file (line numbers current at spec commit, re-confirmed):
  - empty-state structural test at line 159, assertions `queryByRole('list')` null (168), `queryAllByRole('listitem')` length 0 (169), `document.querySelector('ul')` null (170), `document.querySelector('li')` null (171): satisfied because in the empty state neither button renders and the notice/header are `div`/`p`, never `ul`/`li`/`role="list"`.
  - bare `getByText('settings')` at lines 46 and 64; `getByText('just now')` at line 48 — new strings `Clear activity`/`Undo`/`Activity cleared.`/`Activity restored.` collide with none.
  - `getByRole('list')` at lines 106 and 137 — no second list role added.
  - `getByRole('button', { name: 'Toggle email notifications' })` at line 54; `getByText('On')` at line 60 — new button names/strings are distinct.
  - `records production settings interactions` at line 51 renders `<App />`, clicks the toggle → one entry stored → the `Clear activity` button now renders in that test; it does not collide with any query there and the toggle lookup still resolves uniquely.
  - `cleans up its subscription on unmount` at line 143 spies on `console.error` and asserts it is never called — the new timer effect adds no logging and cleans up on unmount, so it stays green.
- **200% zoom / 320 px wrap (designer Concerns 8, 9)** — header and notice use `flex-wrap`; the Clear pill drops under the heading below ~388 px, label wraps to two lines at 200% zoom; measured `scrollWidth` 320 with no horizontal scroll. *Mitigation: accept the designed wrap; no new media query.*
- **Performance** — one extra `setTimeout` per clear; storage read count per render is unchanged (still one `getVisibleActivities()` on notify; `hasStoredEntries` derives from `activities`, no extra read). *Negligible.*
- **tsc strictness** — refs typed `useRef<HTMLButtonElement>(null)` / `useRef<HTMLHeadingElement>(null)` / `useRef<Activity[] | null>(null)` / `useRef<'undo' | 'clear' | null>(null)`; `statusMessage` typed as the literal union; `noUnusedLocals`/`noUnusedParameters` satisfied. *Mitigation: no `any`; all refs read.*
- **vitest fake timers vs the existing 30s interval and `vi.setSystemTime`** — under `vi.useFakeTimers()`, `advanceTimersByTime` advances both the 5000 ms undo timeout and the 30_000 ms refresh interval; tests scope assertions to what they check and advance precise amounts (4999/5000). *Mitigation: each new component test seeds with `vi.setSystemTime` where relative labels matter and uses `act(() => vi.advanceTimersByTime(...))`.*

## Test plan

Run: `npm test`. Component tests use `vi.useFakeTimers()` + `vi.setSystemTime(...)` and `act(() => vi.advanceTimersByTime(ms))`; scope with `within(section)` where a role/label could be ambiguous; storage-failure via `vi.spyOn(Storage.prototype, 'setItem'|'getItem').mockImplementation(() => { throw ... })`; reload simulated by `unmount()` + fresh `render(...)`. Keyboard via `fireEvent.keyDown`/`fireEvent.click` for Enter/Space on native buttons.

| Req | File | Case name (`it('...')`) | What it asserts |
| --- | --- | --- | --- |
| R1 | activityStore.test.ts | `clearActivities empties storage and returns removed entries newest-first` | Seed several entries; `clearActivities()` returns them newest-first; `getActivities()` is `[]`; raw `demo.activity` parses to `[]`. |
| R1 | ActivityFeed.test.tsx | `shows Clear activity only when entries are stored` | With entries seeded, `within(section).getByRole('button', { name: 'Clear activity' })` present; with storage empty, `queryByRole('button', { name: 'Clear activity' })` null and empty copy shows. |
| R1 | ActivityFeed.test.tsx | `Clear removes all stored entries not just the visible 20` | Seed >20 entries; click Clear; list gone; `getActivities()` is `[]`; `document.querySelector('li')` null. |
| R2 | activityStore.test.ts | `restoreActivities merges, de-dupes by id, sorts newest-first, caps at 100` | Snapshot + a stored entry overlapping by id; result de-duped (snapshot wins), newest-first, length capped at 100. |
| R2 | ActivityFeed.test.tsx | `Clear shows Undo and status, Undo restores exact entries in order` | Fake timers; seed; click Clear → `Undo` button + `Activity cleared.` status; click Undo → same entries in same order render, Undo affordance gone. |
| R2 | ActivityFeed.test.tsx | `Undo stays available at 4999ms and disappears at 5000ms` | After Clear, `advanceTimersByTime(4999)` still shows Undo; one more ms (`advanceTimersByTime(1)`) removes it. |
| R3 | ActivityFeed.test.tsx | `expiry removes Undo and restores empty copy, snapshot unrecoverable` | After Clear, `advanceTimersByTime(5000)`; Undo gone, empty copy back; no Undo button offered. |
| R3 | ActivityFeed.test.tsx | `no timer callback and no console error after unmount` | Spy `console.error`; render, Clear, `unmount()`, `advanceTimersByTime(5000)`; spy never called, no throw. |
| R4 | ActivityFeed.test.tsx | `reload inside window shows empty feed with no Undo` | Clear; `unmount()` + fresh `render()` while inside window; empty feed, no Undo. |
| R4 | ActivityFeed.test.tsx | `reload after Undo shows restored entries` | Clear then Undo; `unmount()` + fresh `render()`; restored entries render. |
| R5 | ActivityFeed.test.tsx | `clear and undo write no activity entry` | Capture `getActivities().length` around Clear and around Undo; neither adds an entry. |
| R5 | ActivityFeed.test.tsx | `entry added during window appears and re-enables Clear` | Open window; `act(() => addActivity('settings', '...'))`; new entry in list; `Clear activity` present again; Undo still shown. |
| R5 | ActivityFeed.test.tsx | `second Clear merges snapshot and restarts window, Undo restores both` | Clear; add entry; Clear again; advance <5000 from second clear; Undo → all entries from both clears restored. |
| R6 | ActivityFeed.test.tsx | `Enter activates Clear and focus moves to Undo` | Focus Clear, Enter → `Undo` `toHaveFocus()`. |
| R6 | ActivityFeed.test.tsx | `Space activates Clear and focus moves to Undo` | Space on Clear → `Undo` `toHaveFocus()`. |
| R6 | ActivityFeed.test.tsx | `Undo activation moves focus to Clear` | After Clear, activate Undo → `Clear activity` `toHaveFocus()`. |
| R6 | ActivityFeed.test.tsx | `expiry while Undo focused moves focus to heading` | Clear (focus on Undo), `advanceTimersByTime(5000)` → `Recent Activity` heading `toHaveFocus()`. |
| R7 | ActivityFeed.test.tsx | `status region announces cleared then restored and is not a list` | `getByRole('status')` reads `Activity cleared.` after Clear, `Activity restored.` after Undo; it is a `<p>` (not ul/li/role=list); the `ul` `aria-live="polite"` is unchanged; nothing new announced on expiry (status text becomes `''`). |
| R8 | activityStore.test.ts | `clearActivities and restoreActivities fail soft and still notify` | Spy `Storage.prototype.setItem` (and `getItem`) to throw; neither function throws; subscriber still notified. |
| R8 | ActivityFeed.test.tsx | `Clear empties the list in memory even when setItem throws` | Spy `setItem` to throw; click Clear; list empties in memory, Undo affordance shows, no error text rendered. |
| R10 | (coverage) | — | The rows above are the coverage R10 enumerates. |

Added by the TEAM-4183 review-fix ticket (all seven were verified to fail against the pre-fix component/CSS):

| Finding | File | Case name (`it('...')`) | What it asserts |
| --- | --- | --- | --- |
| F1 (D1, D5) | ActivityFeed.test.tsx | `hovering the notice row pauses the undo window and leaving restarts a fresh window` | Clear; advance 3000; `fireEvent.pointerEnter` the notice row; advance 5000 → Undo still present (paused); `pointerLeave`; advance 4999 → still present; advance 1 → gone (fresh full window, not a resume). |
| F1 (D5) | ActivityFeed.test.tsx | `a stale hover pause does not leak into the next window` | Clear; pointerEnter the notice row; click Undo (the button unmounts under the cursor, so no `pointerleave` fires); Clear again; advance 5000 → Undo gone. Guards the `setIsPaused(false)` resets. |
| F1 (D5) | ActivityFeed.test.tsx | `hovering the notice row while no window is open has no effect` | pointerEnter while idle → no Undo appears, Clear still shown; then Clear and advance 5000 → Undo gone, so an idle hover does not poison the next window. |
| F2 (D2) | ActivityFeed.test.tsx | `keeps the status live region rendered and unhidden while empty` | Idle: `getByRole('status')` is present with `textContent === ''`, keeps `role="status"` and its class, has no `hidden`/`aria-hidden`, and its computed `display`/`visibility` are not `none`/`hidden`. The effective cascade cannot be asserted in jsdom (vitest runs with CSS processing disabled, so no stylesheet is applied; a `?raw` import returns `''` for the same reason and `node:fs` would need `@types/node`, which is not a dependency) — it is asserted in the Playwright pass instead: notice row 0 px tall when idle and `display !== 'none'` with the real stylesheet loaded. |
| F2b (D3) | ActivityFeed.test.tsx | `second Clear inside the window re-announces by mutating the status text` | Clear → status `Activity cleared.`; `act(addActivity(...))`; Clear again → status `textContent` is `''` immediately and Undo is still shown (row does not collapse); `advanceTimersByTime(0)` → status `Activity cleared.` again. |
| F2b (D3) | ActivityFeed.test.tsx | `a pending re-announce is cancelled by Undo` | Second Clear (blank tick pending), then Undo → status is `Activity restored.`; advance 5000 → still `Activity restored.`, so the queued re-set was cancelled rather than overwriting it. |
| F3 (D4) | ActivityFeed.test.tsx | `Undo with an empty snapshot announces nothing and keeps focus off document.body` | Seed 3, render, then spy `Storage.prototype.getItem` to throw; Clear (so `clearActivities()` reports nothing removed); Undo is offered and focused; click Undo → status `textContent` is `''` (never `Activity restored.`), Undo gone, `document.body` not focused, heading focused; after `mockRestore`, `getActivities()` is `[]` and raw storage parses to `[]` (nothing written back). |

Visual evidence artifacts (implement/QA ticket): `docs/TEAM-4162-clear.png` (cleared-with-undo, 1280 px), `docs/TEAM-4162-undo.png` (restored, 1280 px), `docs/TEAM-4162-narrow.png` (320 px, header wrapped).

## Rollback

Revert the single squash commit / merged PR for this feature branch. No data migration is needed — the localStorage format for `demo.activity` is unchanged (still a JSON array of the same Activity shape); reverting the code simply removes the Clear/Undo controls and the two store functions. Entries that users cleared before a rollback are gone by design (the clear committed to storage at click time and the snapshot was memory-only). There is no feature flag in this repo — none exists to toggle — so rollback is code revert only.

## Open questions

1. **`restoreActivities` returns `Activity[]` vs spec's `void`.** Recommended: accept `Activity[]` (strict superset; enables the R8 in-memory component assertion). Alternative: keep `void` and relax the R8 component test to assert only that Undo/status appear, not that the list empties on write failure. (Concern 10.)
2. **Effect-owned timer vs designer's imperative `timerRef`.** Recommended: effect-owned `setTimeout` keyed on `[isWindowOpen, undoWindowKey]`, per spec R3 and the existing interval pattern — StrictMode-safe and auto-cleans on unmount. Visible behavior is identical to the designer's sketch.
3. **Commit docs/ screenshots on the feature branch (implementation ticket).** Recommended: yes — the docs/ `TEAM-<n>-*.png` convention already exists and the spec Test plan names these artifacts. They are an allowed file touch.
4. **Accept designer Concerns 7/8/9 as rendered.** Recommended: yes — notice row above the list (7), `flex-wrap` at 320 px (8), and the `2.75rem` / `2px` numerics (9). This plan follows the design as written.

## Policy re-check

- **Security:** no new endpoint, tool, queue, webhook, bucket, table, secret, or network call; the only storage surface is the existing `demo.activity` key, now also written by `clearActivities`/`restoreActivities`. Restore input flows through the existing `sanitizeActivities`/`isActivity` validation. No `console` output added. Matches the spec's Security answers.
- **Compliance:** no new stored field; the undo snapshot is memory-only (`undoSnapshotRef`), never written to storage or transmitted. This is a deletion mechanism plus a transient in-memory restore. Matches the spec's data inventory.
- **Brand:** copy limited to the four proposed strings (`Clear activity`, `Undo`, `Activity cleared.`, `Activity restored.`); tokens limited to the listed existing values plus the two Concern-9 numerics (`2.75rem`, `2px`). No new hex, font, or icon. Matches the spec/design Brand answers.
- **UX:** states (default/empty/cleared-with-undo/restored/expired/storage-failure/disabled-none), keyboard (Tab/Enter/Space on native buttons), focus (Clear→Undo→Clear, heading on expiry), screen reader (single `role="status"`), 320 px, and 200% zoom all as designed. Deviations from the spec's literal wording are the effect-owned timer (spec R3 explicitly permits it) and the notice row placed above the list slot (designer Concern 7); no UX deviation beyond those Concern rows.

## Concerns

| # | Concern | Policy | Owner | Proposed resolution | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | (spec) Brand kit missing; labels/status strings/raw CSS values unverifiable against approved tokens. | Brand | human:brand-lead | Approve the labels and status strings as written and the existing raw values as-is (PO, TEAM-4174 comment 2026-09-06 15:09). Implementation adds no copy or token beyond that set + Concern 9. | resolved |
| 2 | (spec) Destructive Clear has no confirmation dialog; undo is the safety net. | UX | human:design-lead | Undo-only, no confirm step (PO, TEAM-4174 comment 2026-09-06 15:09). | resolved |
| 3 | (spec) Undo auto-dismisses at 5000 ms, not persistent. | UX | human:design-lead | 5000 ms window; pause the countdown while Undo has focus or hover (PO). Implemented as hover-pause on the notice row; focus-pause omitted — see Deviations D1. (PO, TEAM-4174 comment 2026-09-06 15:09.) | resolved |
| 4 | (spec) Reload inside the window loses undo (commit-at-click-time). | UX/intent | human:product-owner | Commit at click time; a reload inside the window is permanent and the snapshot stays memory-only (PO, TEAM-4174 comment 2026-09-06 15:09). | resolved |
| 5 | (spec) Focus not moved into live region; no `aria-live` on Undo. | UX | human:design-lead | Native buttons plus `role="status"`; do not move focus into the live region (PO, TEAM-4174 comment 2026-09-06 15:09). | resolved |
| 6 | (spec) Second Clear during window merges snapshot and restarts window. | UX/correctness | human:product-owner | Merge-and-restart, so a later Undo restores everything cleared across clears (PO, TEAM-4174 comment 2026-09-06 15:09). Re-announcement of the repeated status string: see Deviations D3. | resolved |
| 7 | (design) Notice row rendered above the list slot so Undo survives a new entry during the window. | UX | human:product-owner | Accept the design placement (PO, TEAM-4176 Design Approval 2026-09-06 15:30). | resolved |
| 8 | (design) Heading + Clear cannot share one line at 320 px; button wraps under heading via `flex-wrap`. | UX | human:design-lead | Accept the wrap; no horizontal scroll (PO, TEAM-4176 Design Approval 2026-09-06 15:30). Measured `scrollWidth` 320 at 320 px. | resolved |
| 9 | (design) Two new numerics: `min-height: 2.75rem` (44 px) and `2px` focus outline. | Brand/UX | human:brand-lead | Approve both values (PO, TEAM-4176 Design Approval 2026-09-06 15:30). | resolved |
| 10 | `restoreActivities` returns the sanitized `Activity[]` instead of `void`, so the component can keep the in-memory list consistent when storage writes fail (R8). | correctness | human:engineer | Accept the superset signature; void callers unaffected (engineer, TEAM-4178 Plan Approval 2026-09-06 15:45 — approved as planned). | resolved |
| 11 | Component sets `activities` state directly from the clear/restore return values in addition to the pub/sub re-read (needed for R8; behavior identical on the success path, handler's setState wins in-batch). | correctness | human:engineer | Accept the direct setState (engineer, TEAM-4178 Plan Approval 2026-09-06 15:45 — approved as planned). | resolved |
| 12 | New component tests append a `describe` block and add symbols to the existing `./activityStore` import line in `ActivityFeed.test.tsx`; store tests append a `describe` block. No existing test case is edited. If a reviewer treats the added import symbols as touching existing setup, the suite moves to a new sibling file (`ActivityFeed.clear.test.tsx`). | process | human:engineer | Append to the existing files (engineer, TEAM-4178 Plan Approval 2026-09-06 15:45 — approved as planned). Reviewer confirmed at TEAM-4180 that only import lines were widened. | resolved |

## Deviations

All five were introduced by the TEAM-4183 review-fix ticket (code review round 1, `findings.md`).

| # | Deviation | From | Reason | Ticket |
| --- | --- | --- | --- | --- |
| D1 | Focus-pause omitted; only the pointer-hover pause is implemented. | PO decision on Concern 3 (TEAM-4174, 2026-09-06 15:09): "pause the countdown while Undo has focus **or** hover". | R6 auto-focuses `Undo` after every Clear, so a focus-pause would make the window effectively unbounded for every user until they moved focus — contradicting R2's "exactly UNDO_WINDOW_MS" and making R6's expiry-while-focused path (and its test) unreachable. The design doc reached the same conclusion (design Concern 3). The hover half of the PO's decision is implemented in full. **Pending PO confirmation on TEAM-4183.** | TEAM-4183 (F1) |
| D2 | Dropped `.activity-feed__status:empty { display: none; }` from the design's ready-to-paste CSS block. | design/frontend-designer.md CSS block; plan §(c) "append verbatim". | A `display: none` element is not exposed to assistive tech, so the live region entered the accessibility tree in the same mutation as its first text — the case MDN's live-region guide says to avoid ("Start with an empty live region, then — in a separate step — change the content"). Costs no layout: an empty `<p>` with `margin: 0` generates no line box, so the notice row still measures 0 px tall when idle (measured in Chromium, recorded on the TEAM-4183 PR). The design doc named this exact fallback. | TEAM-4183 (F2) |
| D3 | A second Clear inside an open window re-announces by setting the status to `''` and re-setting `'Activity cleared.'` on the next tick, instead of re-setting the identical string. | plan §(b) "Second clear during an open window", which called identical-text silence "acceptable per R7 and the designer's note". | Re-setting an identical string is not a DOM mutation, so live regions do not re-announce it and the second Clear was silent for screen-reader users — contrary to R7's "announces `Activity cleared.`". This is the design doc's own named option (clear to `''`, then set the string on the next frame) and adds no copy. Only the repeated-string case is deferred; every other transition stays synchronous, so no existing test changes. | TEAM-4183 (F2b) |
| D4 | `handleUndo` treats a null/empty snapshot as an expiry-style close (`closeWindow()`) instead of restoring and announcing. | plan §(b) `handleUndo`, which did `undoSnapshotRef.current ?? []` and continued unconditionally. | With an empty snapshot the old path called `restoreActivities([])`, announced `'Activity restored.'` when nothing was restored, and aimed `pendingFocusRef` at a `Clear` button that is not mounted — so the focused `Undo` button unmounted and focus fell to `document.body`, the exact outcome R6 exists to prevent. Reachable via an R8 read failure at click time (`getItem` throws → `clearActivities()` reports nothing removed) and via the expiry/click race. The expiry logic is now extracted into one `closeWindow()` used by both paths. | TEAM-4183 (F3) |
| D5 | Adds `isPaused` state, `onPointerEnter`/`onPointerLeave` handlers on the notice row, and a third dependency on the timer effect. | plan §(b) state list, DOM skeleton and the two-dependency timer effect. | Mechanism for D1's hover-pause, following the design Concern 3 sketch (clear the timer on `pointerenter`, restart a fresh `UNDO_WINDOW_MS` on `pointerleave`). Restart-not-resume needs no elapsed-time bookkeeping, and because the effect cleanup clears the old id the restart is free. With no pointer involved the effect behaves exactly as before, so the 4999/5000 ms boundary tests are unchanged. `handleClear`, `handleUndo` and `closeWindow` all reset the flag so a stale pause cannot make the next window immortal. | TEAM-4183 (F1) |
