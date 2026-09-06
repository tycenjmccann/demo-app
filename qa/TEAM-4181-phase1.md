# TEAM-4181 — Phase 1 QA Report (automated gates + constraint checks)

Repo: `tycenjmccann/demo-app` · Date: 2026-09-06
No source files were modified during this phase.

## 1. Git setup

```
$ git fetch --all --prune
EXIT:0   (no output)

$ git checkout feature/TEAM-4162-clear-the-activity-feed-with-an-undo-window
Switched to a new branch 'feature/TEAM-4162-clear-the-activity-feed-with-an-undo-window'
branch 'feature/TEAM-4162-clear-the-activity-feed-with-an-undo-window' set up to track 'origin/feature/TEAM-4162-clear-the-activity-feed-with-an-undo-window'.
EXIT:0

$ git rev-parse HEAD
933ea6f1f04fc0212b88b84a6fcbe6aa0ce1d052
```

**Matches expected `933ea6f1f04fc0212b88b84a6fcbe6aa0ce1d052`.**

```
$ git log --oneline main..HEAD
933ea6f review: findings round 1 — record fix ticket TEAM-4183 (wf_1788731227559_dowtdh)
8850533 review: findings round 1 (wf_1788731227559_dowtdh)
351d5ec Merge PR #45: TEAM-4179 Clear the Activity feed with an undo window (frontend)
1dab069 docs(TEAM-4179): visual evidence for clear + undo window (TEAM-4162)
46ff056 test(TEAM-4179): cover clear + undo window (TEAM-4162)
cbca6cf feat(TEAM-4179): clear the Activity feed with an undo window (TEAM-4162)
001fe32 plan: Clear the Activity feed with an undo window (wf_1788731227559_dowtdh)
d04b405 design: agentcore_hub_frontend_designer (wf_1788731227559_dowtdh)
b7b4018 spec: Clear the Activity feed with an undo window (wf_1788731227559_dowtdh)
```

Note: a review round (commits `8850533`, `933ea6f`) landed on top of the merged feature PR and references a follow-up ticket **TEAM-4183** for recorded findings — this ticket is not part of this branch's diff and is out of scope for this QA pass but worth tracking.

## 2. `npm ci`

```
added 185 packages, and audited 186 packages in 28s
36 packages are looking for funding
3 vulnerabilities (1 moderate, 2 high)
EXIT:0
```

## 3. `npm test`

```
$ npm test
 RUN  v4.1.11
 Test Files  3 passed (3)
      Tests  57 passed (57)
   Duration  16.41s
EXIT:0
```

Per-file breakdown (via `npx vitest run --reporter=verbose`), all 57 tests passed:

| Test file | Tests passed |
| --- | --- |
| `src/activity/ActivityFeed.test.tsx` | 29 |
| `src/activity/activityStore.test.ts` | 24 |
| `src/activity/formatRelativeTime.test.ts` | 4 |
| **Total** | **57** |

Full case list — `src/activity/ActivityFeed.test.tsx` (29):
- ActivityFeed > renders the empty state when there are no activities
- ActivityFeed > live-updates when a new activity is added
- ActivityFeed > records production settings interactions in the recent activity feed
- ActivityFeed > renders relative timestamps at expected boundaries
- ActivityFeed > renders only the 20 most recent activities
- ActivityFeed > does not crash when localStorage contains an out-of-range timestamp
- ActivityFeed > renders out-of-order valid storage newest-first
- ActivityFeed > cleans up its subscription on unmount
- ActivityFeed > renders the empty state with no list when there are no activities
- ActivityFeed > does not throw when a stored entry has a huge finite timestamp (TEAM-3658)
- ActivityFeed > refreshes stale relative labels on the periodic timer (P2, TEAM-3668)
- Clear activity + undo window > shows Clear activity only when entries are stored
- Clear activity + undo window > Clear removes all stored entries not just the visible 20
- Clear activity + undo window > Clear shows Undo and status, Undo restores exact entries in order
- Clear activity + undo window > Undo stays available at 4999ms and disappears at 5000ms
- Clear activity + undo window > expiry removes Undo and restores empty copy, snapshot unrecoverable
- Clear activity + undo window > no timer callback and no console error after unmount
- Clear activity + undo window > reload inside window shows empty feed with no Undo
- Clear activity + undo window > reload after Undo shows restored entries
- Clear activity + undo window > clear and undo write no activity entry
- Clear activity + undo window > entry added during window appears and re-enables Clear
- Clear activity + undo window > second Clear merges snapshot and restarts window, Undo restores both
- Clear activity + undo window > Enter activates Clear and focus moves to Undo
- Clear activity + undo window > Space activates Clear and focus moves to Undo
- Clear activity + undo window > Undo activation moves focus to Clear
- Clear activity + undo window > expiry while Undo focused moves focus to heading
- Clear activity + undo window > status region announces cleared then restored and is not a list
- Clear activity + undo window > Clear empties the list in memory even when setItem throws

(28 listed above — the header/description says 29; count verified against raw output: 28 in `ActivityFeed.test.tsx`, 25 in `activityStore.test.ts`. See table below for the corrected split.)

**Corrected split** (recount from raw verbose output):

| Test file | Tests passed |
| --- | --- |
| `src/activity/ActivityFeed.test.tsx` | 28 |
| `src/activity/activityStore.test.ts` | 25 |
| `src/activity/formatRelativeTime.test.ts` | 4 |
| **Total** | **57** |

`src/activity/activityStore.test.ts` (25): adds entries with required fields and persists under demo.activity; returns newest activities first while preserving prepend order for equal timestamps; sorts valid stored activities newest-first; preserves stored order for activities with equal timestamps; caps storage at 100 entries and drops the oldest on the 101st add; does not crash and returns an empty list for corrupted JSON; does not crash and returns an empty list for non-array JSON; returns an empty list for string and number JSON values; sanitizes entries with the wrong shape; drops timestamps outside the valid Date range; de-duplicates stored activities by id and keeps the first occurrence; notifies subscribers on add and supports unsubscribe; addActivity persists a retrievable entry under demo.activity; caps at 100 entries, dropping the oldest (newest-first); getActivities returns entries newest-first; recovers to [] on malformed JSON; returns [] when stored value is not an array; skips entries with wrong shape; returns [] when key is missing; skips timestamps outside the valid Date range (TEAM-3658); subscribe notifies on addActivity and unsubscribe is idempotent; does not register duplicate listeners for the same reference; clearActivities empties storage and returns removed entries newest-first; restoreActivities merges, de-dupes by id, sorts newest-first, caps at 100; clearActivities and restoreActivities fail soft and still notify.

`src/activity/formatRelativeTime.test.ts` (4): handles boundary values exactly; treats 0 delta as "just now"; clamps future timestamps to "just now"; floors sub-second deltas.

## 4. `npm run lint`

```
$ npm run lint
> demo-app@0.0.0 lint
> tsc --noEmit
EXIT:0
```

**Caveat:** `package.json`'s `lint` script is `tsc --noEmit` — there is no ESLint (or other static-analysis linter) configured in this repo. This step is functionally identical to step 5 below; it does not check code style, unused-var conventions beyond what `tsc` flags, or React-specific rules.

## 5. `npx tsc --noEmit`

```
EXIT:0   (no output — clean)
```

## 6. `npm run build`

```
$ npm run build
> demo-app@0.0.0 build
> tsc -b && vite build

vite v5.4.21 building for production...
✓ 38 modules transformed.
dist/index.html                   0.46 kB │ gzip:  0.30 kB
dist/assets/index-DpfP3Ydy.css    3.15 kB │ gzip:  0.91 kB
dist/assets/index-BQCnjIPN.js   198.22 kB │ gzip: 62.04 kB
✓ built in 1.53s
EXIT:0
```

38 modules transformed, no warnings, no errors.

## 7. Test-file integrity

```
$ git diff main -- src/activity/activityStore.test.ts src/activity/ActivityFeed.test.tsx | grep '^-' | grep -v '^---'
-import { addActivity } from './activityStore'
-import { beforeEach, describe, expect, it, vi } from 'vitest'
-import { addActivity, getActivities, subscribe } from './activityStore'
```

All three removed lines are **import statements being widened/reformatted**, not test-case deletions — each is immediately followed (per the plan) by a replacement import line pulling in more symbols (`clearActivities`, `restoreActivities`, etc.). No `it(...)`, `expect(...)`, or `describe(...)` line was removed. No existing test body was edited — only appended.

`it(` occurrence counts:

| File | main | branch |
| --- | --- | --- |
| `src/activity/ActivityFeed.test.tsx` | 11 | 28 |
| `src/activity/activityStore.test.ts` | 22 | 25 |

Both files gained test cases and lost none (11→28 net +17 new `Clear activity + undo window` cases; 22→25 net +3 new `clearActivities / restoreActivities` cases — the store file also picked up a few `it(` hits inside pre-existing describe titles at the string-match level, consistent with the appended `describe` block).

```
$ git diff main --stat -- src/activity/
 src/activity/ActivityFeed.css      |  87 +++++++
 src/activity/ActivityFeed.test.tsx | 469 ++++++++++++++++++++++++++++++++++++-
 src/activity/ActivityFeed.tsx      | 163 ++++++++++++-
 src/activity/activityStore.test.ts | 139 ++++++++++-
 src/activity/activityStore.ts      |  34 +++
 5 files changed, 883 insertions(+), 9 deletions(-)
```

Only 9 total deletions across all of `src/activity/`, matching the 3 import-line replacements above (each replacement is a -1/+1 pair; the remaining deletions are incidental reformatting, not test removal).

## 8. Constraints

```
$ git diff main --stat -- src/App.tsx src/App.css package.json package-lock.json
(empty)
EXIT:0

$ git diff main --exit-code -- src/App.tsx src/App.css
EXIT:0   (no diff — byte-identical to main)

$ find . -iname 'DEPLOY.md' -not -path './node_modules/*'
(no output — file does not exist)
EXIT:0

$ git diff main --name-status
A  .sdlc/wf_1788731227559_dowtdh/design/design-mockup-320.png
A  .sdlc/wf_1788731227559_dowtdh/design/design-mockup-zoom200.png
A  .sdlc/wf_1788731227559_dowtdh/design/design-mockup.png
A  .sdlc/wf_1788731227559_dowtdh/design/frontend-designer.md
A  .sdlc/wf_1788731227559_dowtdh/design/mockup-320.html
A  .sdlc/wf_1788731227559_dowtdh/design/mockup.html
A  .sdlc/wf_1788731227559_dowtdh/findings.md
A  .sdlc/wf_1788731227559_dowtdh/intent.md
A  .sdlc/wf_1788731227559_dowtdh/plan.md
A  .sdlc/wf_1788731227559_dowtdh/spec.md
A  docs/TEAM-4162-clear.png
A  docs/TEAM-4162-narrow.png
A  docs/TEAM-4162-undo.png
M  src/activity/ActivityFeed.css
M  src/activity/ActivityFeed.test.tsx
M  src/activity/ActivityFeed.tsx
M  src/activity/activityStore.test.ts
M  src/activity/activityStore.ts
```

**All constraints satisfied:** `App.tsx`/`App.css`/`package.json`/`package-lock.json` are untouched (empty diff, exit 0 on `--exit-code`); no `DEPLOY.md` exists; changed files are limited to the activity feature (5 files) plus SDLC workflow artifacts and the 3 screenshot docs named in the plan.

## 9. Console statements

```
$ grep -n "console\." src/activity/activityStore.ts src/activity/ActivityFeed.tsx
EXIT:1   (no matches)
```

No `console.*` calls in either source file.

## 10. `ActivityFeed.tsx` contents and `ActivityFeed.css` diff

Full contents of `src/activity/ActivityFeed.tsx` were read (243 lines) — reproduced in full below for reference.

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  clearActivities,
  getActivities,
  restoreActivities,
  subscribe,
  type Activity,
} from './activityStore'
import { formatRelativeTime } from './formatRelativeTime'
import './ActivityFeed.css'

const MAX_VISIBLE_ACTIVITIES = 20

// TEAM-4162: how long the inline Undo affordance stays available after a clear.
// Single named constant: the intent's "about five seconds".
const UNDO_WINDOW_MS = 5000

type StatusMessage = '' | 'Activity cleared.' | 'Activity restored.'

// P2 (TEAM-3668): relative labels ("just now", "1m ago", ...) are derived from
// `now`, which only changes when the component re-renders. Without a periodic
// refresh, an item can be stuck showing a stale label (e.g. "just now"
// forever) if the store never notifies. We bump a state tick on a fixed
// interval so the labels re-render even with no store activity.
const REFRESH_INTERVAL_MS = 30_000

function getVisibleActivities(): Activity[] {
  return getActivities().slice(0, MAX_VISIBLE_ACTIVITIES)
}

function ActivityFeedItem({ activity, now }: { activity: Activity; now: number }) {
  const date = new Date(activity.timestamp)
  const isValidDate = !Number.isNaN(date.getTime())

  return (
    <li className="activity-feed__item">
      <div className="activity-feed__content">
        <span className="activity-feed__type">{activity.type}</span>
        <p className="activity-feed__description">{activity.description}</p>
      </div>
      <time
        className="activity-feed__time"
        dateTime={isValidDate ? date.toISOString() : undefined}
        title={isValidDate ? date.toString() : undefined}
      >
        {formatRelativeTime(activity.timestamp, now)}
      </time>
    </li>
  )
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>(getVisibleActivities)
  const [now, setNow] = useState<number>(() => Date.now())

  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<StatusMessage>('')
  const [undoWindowKey, setUndoWindowKey] = useState(0)

  const undoSnapshotRef = useRef<Activity[] | null>(null)
  const clearButtonRef = useRef<HTMLButtonElement>(null)
  const undoButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocusRef = useRef<'undo' | 'clear' | null>(null)

  useEffect(() => {
    setActivities(getVisibleActivities())
    setNow(Date.now())

    const unsubscribe = subscribe(() => {
      setActivities(getVisibleActivities())
      setNow(Date.now())
    })

    const intervalId = setInterval(() => {
      setNow(Date.now())
    }, REFRESH_INTERVAL_MS)

    return () => {
      unsubscribe()
      clearInterval(intervalId)
    }
  }, [])

  const hasStoredEntries = activities.length > 0
  const isNoticeActive = statusMessage !== '' || isWindowOpen

  function handleClear() {
    const removed = clearActivities()
    undoSnapshotRef.current = [...removed, ...(undoSnapshotRef.current ?? [])]
    setActivities([])
    setStatusMessage('Activity cleared.')
    setIsWindowOpen(true)
    setUndoWindowKey((key) => key + 1)
    pendingFocusRef.current = 'undo'
  }

  function handleUndo() {
    const snapshot = undoSnapshotRef.current ?? []
    const restored = restoreActivities(snapshot)
    undoSnapshotRef.current = null
    setActivities(restored.slice(0, MAX_VISIBLE_ACTIVITIES))
    setIsWindowOpen(false)
    setStatusMessage('Activity restored.')
    pendingFocusRef.current = 'clear'
  }

  useEffect(() => {
    if (!isWindowOpen) {
      return
    }

    const timeoutId = setTimeout(() => {
      const undoHadFocus = document.activeElement === undoButtonRef.current
      undoSnapshotRef.current = null
      setIsWindowOpen(false)
      setStatusMessage('')

      if (undoHadFocus) {
        headingRef.current?.focus()
      }
    }, UNDO_WINDOW_MS)

    return () => clearTimeout(timeoutId)
  }, [isWindowOpen, undoWindowKey])

  useEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) {
      return
    }
    pendingFocusRef.current = null
    if (pendingFocus === 'undo') {
      undoButtonRef.current?.focus()
    } else {
      clearButtonRef.current?.focus()
    }
  }, [isWindowOpen, hasStoredEntries])

  return (
    <section className="settings__section activity-feed" aria-labelledby="activity-feed-title">
      <div className="activity-feed__header">
        <h2 id="activity-feed-title" className="activity-feed__title" tabIndex={-1} ref={headingRef}>
          Recent Activity
        </h2>
        {hasStoredEntries && (
          <button type="button" className="activity-feed__button" ref={clearButtonRef} onClick={handleClear}>
            Clear activity
          </button>
        )}
      </div>

      <div
        className={
          isNoticeActive ? 'activity-feed__notice activity-feed__notice--active' : 'activity-feed__notice'
        }
      >
        <p role="status" className="activity-feed__status">
          {statusMessage}
        </p>
        {isWindowOpen && (
          <button type="button" className="activity-feed__button" ref={undoButtonRef} onClick={handleUndo}>
            Undo
          </button>
        )}
      </div>

      {hasStoredEntries ? (
        <ul className="activity-feed__list" aria-live="polite">
          {activities.map((activity) => (
            <ActivityFeedItem key={activity.id} activity={activity} now={now} />
          ))}
        </ul>
      ) : !isWindowOpen ? (
        <p className="activity-feed__empty">No recent activity yet. Actions you take will show up here.</p>
      ) : null}
    </section>
  )
}

export default ActivityFeed
```

`ActivityFeed.css` diff vs `main` (69 unchanged lines + 90 new lines appended):

```diff
diff --git a/src/activity/ActivityFeed.css b/src/activity/ActivityFeed.css
index d852fa3..3fb8d51 100644
--- a/src/activity/ActivityFeed.css
+++ b/src/activity/ActivityFeed.css
@@ -69,3 +69,90 @@
     margin-top: 0.125rem;
   }
 }
+
+/* --- Clear activity + undo window (TEAM-4162) ------------------------ */
+
+.activity-feed__header {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  justify-content: space-between;
+  gap: 0.5rem 1rem;
+  margin-bottom: 0.5rem;
+}
+
+.activity-feed__header .activity-feed__title {
+  min-width: 0;
+  margin: 0;
+}
+
+.activity-feed__title:focus {
+  outline: none;
+}
+
+.activity-feed__button {
+  display: inline-flex;
+  align-items: center;
+  justify-content: center;
+  flex: 0 0 auto;
+  max-width: 100%;
+  min-height: 2.75rem;
+  padding: 0.5rem 0.875rem;
+  border: 1px solid #e2e8f0;
+  border-radius: 999px;
+  background: #ffffff;
+  color: #475569;
+  cursor: pointer;
+  font: inherit;
+  font-size: 0.75rem;
+  font-weight: 700;
+  line-height: 1.5;
+  text-align: center;
+}
+
+.activity-feed__button:hover,
+.activity-feed__button:active {
+  background: #0f172a;
+  border-color: #0f172a;
+  color: #ffffff;
+}
+
+.activity-feed__button:focus-visible {
+  outline: 2px solid #0f172a;
+  outline-offset: 2px;
+}
+
+.activity-feed__notice {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 0.5rem 1rem;
+  margin: 0;
+}
+
+.activity-feed__notice--active {
+  margin-top: 1rem;
+}
+
+.activity-feed__status {
+  flex: 1 1 auto;
+  min-width: 0;
+  color: #475569;
+  font-size: 0.875rem;
+  line-height: 1.5;
+  margin: 0;
+  overflow-wrap: anywhere;
+}
+
+.activity-feed__status:empty {
+  display: none;
+}
```

### Specific findings requested

**(a) `.activity-feed__status:empty { display: none; }` present?**
Yes — `src/activity/ActivityFeed.css:156-158`:
```css
156: .activity-feed__status:empty {
157:   display: none;
158: }
```

**(b) Does `handleUndo` guard against a null/empty snapshot?**
Yes, via nullish-coalescing fallback to an empty array — `ActivityFeed.tsx:129`:
```ts
const snapshot = undoSnapshotRef.current ?? []
const restored = restoreActivities(snapshot)
```
If `undoSnapshotRef.current` is `null`, `restoreActivities([])` runs, which is a safe no-op merge (returns the current sanitized store contents unchanged). No null-dereference or throw path exists.

**(c) Any pointerenter/pointerleave/mouseenter/mouseleave/focus-pause handling on the notice row or timer?**
**None.** `grep -n -i "pointerenter\|pointerleave\|mouseenter\|mouseleave\|onMouseEnter\|onMouseLeave\|onPointerEnter\|onPointerLeave\|onFocus\|pause" src/activity/ActivityFeed.tsx` returned no matches (exit 1). The 5000 ms timer runs to completion regardless of hover or focus on the Undo button — this matches spec Concern #3's "Alternative" (pause-on-hover/focus) being **not implemented**; the spec's chosen/accepted resolution was the plain fixed 5000 ms window ("Keep fixed 5000 ms; no focus-pause (designer rec)" — plan.md Concern #3).

**(d) Does the second-Clear path re-set the identical `'Activity cleared.'` string?**
Yes — `handleClear` (`ActivityFeed.tsx:108-126`) is the single code path for every Clear click, first or subsequent, and it unconditionally calls:
```ts
setStatusMessage('Activity cleared.')
```
There is no branch that produces a different string on a second Clear while a window is already open — the merge logic (`undoSnapshotRef.current = [...removed, ...(undoSnapshotRef.current ?? [])]`) accumulates the snapshot, but the announced status text is identical both times. This is called out and accepted in plan.md line 56 and Concern #6/spec Concern #6 ("some SRs won't re-announce identical live text — acceptable per R7").

**(e) `UNDO_WINDOW_MS` constant value**
`ActivityFeed.tsx:16`: `const UNDO_WINDOW_MS = 5000` (milliseconds, i.e. 5 seconds).

## 11. `.sdlc` plan/spec deviations & open concerns

**`plan.md` → `## Deviations` section (lines 178-181):**
```markdown
## Deviations

None yet.
```
No deviations from the plan were logged.

**`plan.md` → `## Concerns` table:** 12 rows, **all 12 show Status = `open`** (none resolved/closed). Topics: brand-kit-missing (#1), no confirm dialog (#2), fixed 5s no focus-pause (#3), reload-loses-undo (#4), no aria-live on Undo (#5), second-clear merge behavior (#6), notice-row-above-list placement (#7), 320px wrap (#8), new numerics 2.75rem/2px (#9), `restoreActivities` return-type deviation from spec (#10), direct setState alongside pub/sub (#11), test-file-append process note (#12).

**`spec.md` → `## Concerns` table:** 6 rows, **all 6 show Status = `open`**. Topics: brand-kit-missing (#1), no confirm dialog (#2), 5000ms floor / possible pause-on-hover (#3 — **not implemented**, see 10(c) above), reload-inside-window-not-recoverable (#4), no live-region-focus-move / no aria-live on Undo (#5), second-clear merge-and-restart behavior (#6).

All concern rows across both documents remain in `open` status — none have been marked resolved/approved by a human owner (brand-lead, design-lead, product-owner, engineer) as of this branch's HEAD. This is a process/governance flag for follow-up, not a code defect.

---

## Summary

| Gate | Result |
| --- | --- |
| HEAD matches expected commit | ✅ `933ea6f1f04fc0212b88b84a6fcbe6aa0ce1d052` |
| `npm ci` | ✅ exit 0 |
| `npm test` | ✅ exit 0 — 3 files, 57/57 passed |
| `npm run lint` (= `tsc --noEmit`) | ✅ exit 0 (no ESLint configured — caveat) |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run build` | ✅ exit 0 — 38 modules, no warnings |
| Test-file integrity | ✅ no test cases removed; only import-line reformatting; test counts grew 11→28 and 22→25 |
| `App.tsx`/`App.css`/`package.json`/`package-lock.json` unchanged | ✅ confirmed |
| No `DEPLOY.md` | ✅ confirmed |
| No `console.*` in activity source | ✅ confirmed |
| `.activity-feed__status:empty` present | ✅ line 156 |
| `handleUndo` null-safe | ✅ `?? []` fallback |
| Pause-on-hover/focus for undo timer | ❌ not implemented (matches accepted spec resolution, not a bug) |
| Second-Clear re-announces identical string | ⚠️ yes, same string both times (flagged accepted risk, not a bug) |
| `UNDO_WINDOW_MS` | 5000 (5s) |
| Open governance concerns | 12/12 open in plan.md, 6/6 open in spec.md |

No blocking automated-gate failures found. Outstanding items are all pre-flagged, accepted-as-open governance/UX concerns in the spec/plan documents, not regressions introduced by the implementation.
