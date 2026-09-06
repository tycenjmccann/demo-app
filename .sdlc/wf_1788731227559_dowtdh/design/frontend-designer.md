# Design: Clear the Activity feed with an undo window (frontend)

- Workflow: wf_1788731227559_dowtdh
- Epic: TEAM-4162 / Design ticket: TEAM-4175
- Author: agentcore_hub_frontend_designer
- Spec commit: b7b40187 (`.sdlc/wf_1788731227559_dowtdh/spec.md`)
- Branch: feature/TEAM-4162-clear-the-activity-feed-with-an-undo-window
- Status: proposed
- Files this design touches: `src/activity/ActivityFeed.tsx`, `src/activity/ActivityFeed.css` only. `src/App.tsx` and `src/App.css` are out of bounds and are not edited (their rules are relied on, never changed).
- Mockups: `.sdlc/wf_1788731227559_dowtdh/design/` (see "Mockup index" at the end).

## Summary

This is a delta design on the existing Settings page, Activity section. It adds three elements to the `Recent Activity` card and nothing else:

1. A `Clear activity` pill button in a new header row beside the `Recent Activity` heading, present only while at least one entry is stored.
2. An inline undo region beneath the header holding the visible status line and an `Undo` pill button, shown for the 5000 ms window (`UNDO_WINDOW_MS`). It is inline in the card, not a toast.
3. One always-mounted `role="status"` paragraph that reads `Activity cleared.` after a clear and `Activity restored.` after an undo, and announces nothing on expiry.

The buttons reuse the resting look of the existing Email notifications toggle (`.settings__toggle`) and its filled pair for hover, active and focus. No new colors, fonts, icons, shadows, gradients or motion. Two new numeric values are used that are not colors, fonts or icons: `min-height: 2.75rem` (the 44 px target) and the `2px` focus outline width. Both are called out in the Concerns table.

Store changes (`clearActivities`, `restoreActivities`) are the spec's and are not designed here.

## Aesthetic direction

Match the card language that already exists: white cards, 1 px `#e2e8f0` borders, dark `#0f172a` headings, `#475569` secondary text, and a single pill control style. The new `Clear activity` and `Undo` buttons are visually the same pill as the toggle at rest (1 px `#e2e8f0` border, white fill, `#475569` 0.75rem/700 text, `999px` radius, `0.5rem 0.875rem` padding), and use the toggle's pressed look (`#ffffff` on `#0f172a`) for hover and active. The undo region is a plain text line plus a pill, with no box, no tint and no icon, so it reads as part of the card rather than as an alert. Rationale: the intent asks for an affordance on the feed, the section is a quiet settings card, and the safest brownfield move is to add nothing the page does not already know how to draw.

One deliberate deviation from the toggle: the new buttons are 44 px tall (the toggle is 32 px) to meet the spec's preferred touch target. See "Per-element spec > Clear button" and Concern 9.

## Component architecture

### DOM hierarchy (one skeleton, four render branches)

```html
<section class="settings__section activity-feed" aria-labelledby="activity-feed-title">
  <div class="activity-feed__header">
    <h2 id="activity-feed-title" class="activity-feed__title" tabIndex={-1} ref={headingRef}>Recent Activity</h2>
    {hasStoredEntries && (
      <button type="button" class="activity-feed__button" ref={clearButtonRef} onClick={handleClear}>Clear activity</button>
    )}
  </div>

  <!-- always mounted -->
  <div class={"activity-feed__notice" + (isNoticeActive ? " activity-feed__notice--active" : "")}>
    <p role="status" class="activity-feed__status">{statusMessage}</p>   <!-- always mounted, "" when idle -->
    {isWindowOpen && (
      <button type="button" class="activity-feed__button" ref={undoButtonRef} onClick={handleUndo}>Undo</button>
    )}
  </div>

  {activities.length > 0 ? (
    <ul class="activity-feed__list" aria-live="polite"> …existing items unchanged… </ul>
  ) : !isWindowOpen ? (
    <p class="activity-feed__empty">No recent activity yet. Actions you take will show up here.</p>
  ) : null}
</section>
```

Where `isNoticeActive = statusMessage !== '' || isWindowOpen`.

Per-state hierarchy:

| State | Header row | Notice row | Body slot |
| --- | --- | --- | --- |
| default | h2 + `Clear activity` | mounted, empty status, no Undo, no margin (0 px tall) | `ul` list |
| empty | h2 only | mounted, empty, 0 px tall | `.activity-feed__empty` paragraph |
| cleared-with-undo | h2 only (nothing stored) | `--active`; status `Activity cleared.` + `Undo` | nothing (empty paragraph suppressed while the window is open) |
| restored | h2 + `Clear activity` | `--active`; status `Activity restored.`; no Undo | `ul` list |
| expired | h2 only | mounted, status cleared to `""`, no Undo, 0 px tall | `.activity-feed__empty` paragraph |
| new-entry-during-window | h2 + `Clear activity` | `--active`; status `Activity cleared.` + `Undo` | `ul` list with the new entry |

The undo region satisfies R2's "replaces the standard empty-state paragraph": while the window is open the empty paragraph is not rendered and the undo region occupies the card body. Placing the notice row above the list slot (rather than literally inside the body slot) is what keeps `Undo` on screen when a new entry arrives during the window (see Concern 7).

### State ownership (component state in `ActivityFeed`)

| Name | Kind | Type | Meaning |
| --- | --- | --- | --- |
| `activities` | state (existing) | `Activity[]` | The visible 20-item slice. `activities.length > 0` is equivalent to "store count >= 1" because `slice(0, 20)` of a non-empty array is non-empty, so it can drive `hasStoredEntries` without a second read. |
| `now` | state (existing) | `number` | unchanged |
| `undoSnapshot` | ref or state | `Activity[] \| null` | Memory-only copy of cleared entries. Merged on a second clear. Never written to storage. |
| `isWindowOpen` | state | `boolean` | Undo button mounted; empty paragraph suppressed. |
| `statusMessage` | state | `'' \| 'Activity cleared.' \| 'Activity restored.'` | Text of the status paragraph. |
| `clearButtonRef` | ref | `HTMLButtonElement` | focus target after Undo |
| `undoButtonRef` | ref | `HTMLButtonElement` | focus target after Clear; checked at expiry |
| `headingRef` | ref | `HTMLHeadingElement` | focus target at expiry when Undo held focus |
| `timerRef` | ref | `number \| null` | the `UNDO_WINDOW_MS` timeout id; cleared on unmount, restarted on a second clear |

### Event → state → focus

| Event | Store | State after | Status text | Focus goes to |
| --- | --- | --- | --- | --- |
| Activate `Clear activity` | `clearActivities()` (notifies) | `undoSnapshot = merge(prev, removed)`; `isWindowOpen = true`; timer (re)started | `Activity cleared.` | `Undo` (after it mounts) |
| Activate `Undo` | `restoreActivities(snapshot)` (notifies) | `undoSnapshot = null`; `isWindowOpen = false`; timer cleared | `Activity restored.` | `Clear activity` (after it mounts) |
| Timer fires (expiry) | none | `undoSnapshot = null`; `isWindowOpen = false` | set to `""` (nothing announced; removing text does not fire a live announcement) | `Recent Activity` heading, only if `document.activeElement === undoButtonRef.current` at the moment the timer fires (check before the state update unmounts the button); otherwise focus is not touched |
| Store notification (new entry during window) | `addActivity` elsewhere | `activities` updated; `Clear activity` reappears; window and snapshot untouched | unchanged | untouched |
| Second `Clear activity` during window | `clearActivities()` | snapshot merged; timer restarted | `Activity cleared.` (same string re-set; see implementer note on re-announcing) | `Undo` |
| Unmount | none | timer cleared | n/a | n/a |

Focus moves happen after the target mounts. Recommended mechanism: a `pendingFocus` ref (`'undo' | 'clear' | null`) consumed in a `useEffect` that runs after render, or `flushSync` around the state update followed by `ref.current?.focus()`. Either keeps the R6 tests (`expect(button).toHaveFocus()` after `fireEvent`) synchronous enough under `act`.

## Per-element spec

Class names are BEM under the existing `activity-feed__` block. All values below are existing tokens from `src/App.css` / `src/activity/ActivityFeed.css` except the two numeric values flagged in the Summary.

### Header row `.activity-feed__header`

- `display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 1rem; margin-bottom: 0.5rem;`
- Owns the 0.5rem gap that `.settings__section h2` used to supply, so list/empty spacing below the heading is unchanged from today (0.5rem + 1rem).
- Wrap rule: when heading + button + 1rem gap exceed the row (measured 154 px + 120 px + 16 px = 290 px against a 222 px inner width at 320 px), the button drops to a second line, left-aligned under the heading, 0.5rem below it. Horizontal scroll never occurs.

### Heading `.activity-feed__title`

- Existing `<h2 id="activity-feed-title">` gains the class, `tabIndex={-1}`, and `headingRef`. Id and text unchanged; `aria-labelledby` on the section still resolves.
- `.activity-feed__header .activity-feed__title { min-width: 0; margin: 0; }` (specificity 0,2,0 beats `.settings__section h2` at 0,1,1 regardless of stylesheet order).
- `.activity-feed__title:focus { outline: none; }` Recommended: the heading is a landing spot, not a control, and is outside the tab order (`-1`), so WCAG 2.4.7 does not require an indicator; screen readers still announce "Recent Activity, heading level 2" when focus lands there. Mouse users can never focus it, so no stray ring appears.

### Clear button `.activity-feed__button`

- Element: `<button type="button" class="activity-feed__button">Clear activity</button>`. Accessible name is the visible text; no `aria-label`.
- Rendered only when `activities.length > 0` (equivalent to store count >= 1, see State ownership).
- Rest: `display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; max-width: 100%; min-height: 2.75rem; padding: 0.5rem 0.875rem; border: 1px solid #e2e8f0; border-radius: 999px; background: #ffffff; color: #475569; cursor: pointer; font: inherit; font-size: 0.75rem; font-weight: 700; line-height: 1.5; text-align: center;`
- Hover and active: `background: #0f172a; border-color: #0f172a; color: #ffffff;` (the existing `.settings__toggle[aria-pressed='true']` pair). No transition.
- Focus: `:focus-visible { outline: 2px solid #0f172a; outline-offset: 2px; }`. Keyboard users get the ring; mouse clicks do not show it (browser `:focus-visible` heuristics). Programmatic focus after a keyboard activation inherits `:focus-visible` in Chromium and Firefox, so a keyboard user who presses Clear sees the ring on Undo.
- Target size: measured 120 x 44 px at 16 px root (min-height 2.75rem = 44 px). Meets the spec's preferred 44 px and WCAG 2.2 2.5.8 (24 px minimum). The toggle in the General card is 56 x 32 px; the 12 px height difference is intentional and recorded as Concern 9. Alternative if the design lead prefers a 32 px visual: drop `min-height` and extend the hit area with a transparent `::before` pseudo-element (`position: absolute; inset: -0.5rem 0;` on a `position: relative` button), which keeps the pill visually identical to the toggle while the clickable area is 48 px tall. Not recommended for v1 because it adds a positioned pseudo-element for no visual gain.
- Text wrapping: no `white-space: nowrap`. At 200% text zoom in a 320 px viewport the inner width is 126 px and the label wraps to two lines ("Clear" / "activity") inside the pill; the pill stays within the card (measured 126 x 106 px, no overflow). This is the intended degradation.

### Undo region `.activity-feed__notice`

- Element: `<div class="activity-feed__notice">` always mounted directly after the header row and before the list or empty paragraph. Not a `ul`, `li`, list or listitem, and it has no ARIA role (the status child carries `role="status"`).
- `display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1rem; margin: 0;`
- Modifier `.activity-feed__notice--active { margin-top: 1rem; }` applied when `statusMessage !== '' || isWindowOpen`. Without the modifier the row is 0 px tall (measured) and adds no spacing, so the default and empty states are pixel-identical to today's.
- Contents: the status paragraph (flex `1 1 auto`) then the `Undo` button (`flex: 0 0 auto`). Status left, Undo right on one line; at narrow widths the Undo button wraps to a second line below the status text, left-aligned (see 320 px mockup, 200% zoom panel).
- No border, no background tint, no icon, no countdown.

### Undo button

- Element: `<button type="button" class="activity-feed__button">Undo</button>`. Same class and all the same rest/hover/active/focus-visible rules as the Clear button. Accessible name and visible text are exactly `Undo`.
- Mounted only while `isWindowOpen`. Measured 65 x 44 px.
- Receives focus after Clear. Loses focus to the heading if the window expires while it holds focus.

### Status element `.activity-feed__status`

- Element: `<p role="status" class="activity-feed__status">{statusMessage}</p>`, the first child of the notice row. Always mounted, empty string when idle, so the live region exists in the accessibility tree before its text changes (this is what makes announcements reliable across NVDA, JAWS, VoiceOver). `role="status"` is implicitly `aria-live="polite"` and `aria-atomic="true"`; do not add extra ARIA.
- It is a separate element from the Undo button (R7) and is also the visible companion text beside the button, so no additional copy is needed.
- `flex: 1 1 auto; min-width: 0; color: #475569; font-size: 0.875rem; line-height: 1.5; margin: 0; overflow-wrap: anywhere;`
- `.activity-feed__status:empty { display: none; }` so an idle status contributes no line box or gap. `display: none` on an empty live region is safe: the element is remounted in the tree the moment text is set, and since the text change and the display change happen in the same frame every tested screen reader announces it. If the implementer sees a missed first announcement in manual QA, swap `display: none` for `min-height: 0` (the row is already 0 px tall because the flex container has no active margin) rather than removing the `:empty` rule.
- Note `.settings__section p` (App.css) already gives this paragraph `0.875rem` / `#475569` / `margin: 0`; the explicit rule above restates it so the component does not depend on App.css cascade order.

## Layout and responsive

| Width | Header row | Undo region | List |
| --- | --- | --- | --- |
| 640 px container and up (card inner 542 px) | One line: heading left, Clear right | One line: status left, Undo right | unchanged |
| 401 px to 639 px | One line until heading 154 + gap 16 + button 120 = 290 px exceeds the inner width, i.e. below roughly 388 px viewport the button drops under the heading | One line (status ~110 px + Undo 65 px) | unchanged |
| 400 px and below (existing media query) | Button wrapped under heading, left-aligned, 0.5rem row gap. Header row measured 73 px tall at 320 px | One line at 320 px (status 110 px + gap 16 + Undo 65 px = 191 px < 222 px inner) | items wrap, time drops to its own line (existing rule) |
| 320 px viewport | `scrollWidth` 320, no horizontal scroll (measured) | as above | as above |
| 320 px viewport at 200% text zoom (root 32 px, inner width 126 px) | Heading wraps to two words on two lines; Clear pill wraps to two lines; `scrollWidth` 320, no element extends past 320 px (measured) | Status wraps to two lines; Undo drops under it | descriptions break with the existing `overflow-wrap: anywhere` |

The existing `@media (max-width: 400px)` block is untouched. No new media query is needed because the header and notice rows use `flex-wrap` and wrap naturally on content width rather than on a breakpoint.

## Typography and color

### Tokens used (all existing)

| Token | Where it comes from | Used for |
| --- | --- | --- |
| `#0f172a` | App.css `.app` color, `.settings__toggle[aria-pressed='true']` background | hover/active fill, focus outline color |
| `#475569` | App.css `.settings__toggle` color, ActivityFeed.css `.activity-feed__description` | button text at rest, status text |
| `#e2e8f0` | App.css `.settings__section` border, `.settings__toggle` border | button border at rest |
| `#ffffff` | App.css `.settings__section` background | button fill at rest, hover/active text |
| `0.75rem` / 700 | `.settings__toggle` | button label |
| `0.875rem` / 400, line-height 1.5 | `.activity-feed__empty` | status text |
| `Inter, system-ui, -apple-system, sans-serif` | `.app` (inherited via `font: inherit`) | everything |
| `999px` | `.settings__toggle` | pill radius |
| `1px` | all borders | button border |
| `0.5rem 0.875rem` | `.settings__toggle` padding | button padding |
| `0.5rem`, `1rem` | existing gaps and margins | row gaps, notice top margin, header bottom margin |
| `2.75rem` | new numeric value (not a color/font/icon) | button min-height = 44 px target |
| `2px` | new numeric value (not a color/font/icon) | focus outline width and offset |

### Contrast (WCAG 2.x relative luminance, computed)

| Foreground | Background | Ratio | Use | AA text (4.5:1) | AA UI component (3:1) |
| --- | --- | --- | --- | --- | --- |
| `#475569` | `#ffffff` | 7.58:1 | button label at rest, status text | pass | pass |
| `#0f172a` | `#ffffff` | 17.85:1 | heading, focus outline against the card | pass | pass |
| `#ffffff` | `#0f172a` | 17.85:1 | button label on hover/active | pass | pass |
| `#e2e8f0` (border) | `#ffffff` | 1.23:1 | button border at rest | n/a | does not meet 3:1 |
| `#0f172a` (border) | `#e2e8f0` | 14.48:1 | not used; listed for completeness | | |

Note on the 1.23:1 border: the pill border is decorative. The control is identified by its text (7.58:1), its pill shape, its position in the header row, and its focus indicator (17.85:1), which is the same situation as the existing toggle. WCAG 1.4.11 applies to visual information required to identify the component, and the text label carries that. Recorded as a note, not a blocker.

## Motion

None. No transition, transform or animation is added. Hover and active swap colors instantly, matching the toggle. No countdown visual is proposed. If a future iteration adds one, it must be wrapped in `@media (prefers-reduced-motion: no-preference)` and must carry meaning through text (for example remaining seconds in the status line, which would require new copy and a Concern row), never by color alone. It must also not re-announce through the status region every tick.

## Accessibility

### Keyboard

- Both new controls are native `<button type="button">`: Tab reaches them, Enter and Space activate them, no key handlers are added. Escape does nothing (R6).
- Tab order within the section is DOM order: `Clear activity` (when present) → `Undo` (when present) → nothing else. The toggle in the General card precedes both.

### Focus order table

| Trigger | Focus before | Focus after | Ring visible |
| --- | --- | --- | --- |
| Clear activated by keyboard | `Clear activity` | `Undo` | yes (`:focus-visible` carries over on programmatic focus after keyboard input) |
| Clear activated by mouse | `Clear activity` | `Undo` | typically no (mouse origin), acceptable |
| Undo activated | `Undo` | `Clear activity` | as above |
| Expiry while `Undo` focused | `Undo` | `Recent Activity` heading | no (suppressed by design; heading is not a control) |
| Expiry while focus elsewhere | elsewhere | unchanged | n/a |
| New entry during window | anywhere | unchanged | n/a |

### Screen reader announcements

| Moment | Announced |
| --- | --- |
| Clear | `Activity cleared.` (status, polite), then the focused control `Undo, button` |
| Undo | `Activity restored.` (status, polite), then `Clear activity, button` |
| Expiry | nothing from the status element (text is removed, not changed). If focus moved, the heading is announced as `Recent Activity, heading level 2` |
| Second clear during the window | `Activity cleared.` again. Because the string is unchanged, some screen readers will not re-announce identical live text. Acceptable per R7 (a single status element with the right text); if re-announcement is wanted, the implementer can clear to `""` and set the string in the next frame, without new copy. |

### Name, role, value

| Element | Role | Name | Value/state |
| --- | --- | --- | --- |
| Clear | button | `Clear activity` (from content) | none |
| Undo | button | `Undo` (from content) | none |
| Status | status (live, polite, atomic) | none needed | text content |
| Heading | heading level 2, focusable via script only | `Recent Activity` | n/a |

### Target size

Both buttons are 44 px tall and at least 65 px wide at 16 px root; at any zoom they scale with rem. Meets WCAG 2.2 2.5.8 (24 x 24 minimum) and the spec's 44 px preference. Adjacent target spacing: the two buttons are never on the same row.

### Conformance summary

WCAG 2.1 AA: 1.3.1 (native semantics), 1.4.3 (7.58:1 and 17.85:1), 1.4.4 and 1.4.10 (reflow with no horizontal scroll at 320 px and at 200% zoom, measured), 1.4.11 (see border note), 2.1.1 (keyboard), 2.4.3 (focus order table), 2.4.7 (focus visible on both controls), 4.1.2 (name/role), 4.1.3 (status message via `role="status"`). WCAG 2.2: 2.5.8 target size met at 44 px; 2.4.11 focus not obscured, nothing overlays the buttons.

## States table

| State | Rendered | Exact copy shown | Focus | Next action available | DOM sketch |
| --- | --- | --- | --- | --- | --- |
| default | header (h2 + Clear), empty notice (0 px), list | `Recent Activity`, `Clear activity`, entries | wherever the user left it | Clear | `header[h2, button.clear] > notice[p.status:empty] > ul` |
| empty | header (h2), empty notice, empty paragraph | `Recent Activity`, `No recent activity yet. Actions you take will show up here.` | unchanged | none in this section | `header[h2] > notice[p.status:empty] > p.empty` |
| cleared-with-undo | header (h2), active notice with status + Undo; no list, no empty paragraph | `Activity cleared.`, `Undo` | `Undo` | Undo (5000 ms) | `header[h2] > notice--active[p.status, button.undo]` |
| restored | header (h2 + Clear), active notice with status only, list | `Activity restored.`, `Clear activity`, entries | `Clear activity` | Clear | `header[h2, button.clear] > notice--active[p.status] > ul`. Status text stays until the next clear, undo or expiry; no timer. |
| expired | header (h2), empty notice, empty paragraph | empty copy | heading if Undo had focus, else unchanged | none | identical to `empty` |
| storage-failure | identical to the success state for the same action | same | same | same | same. R8: in-memory list updates via pub/sub; no error text, no console output. |
| disabled | none | n/a | n/a | n/a | Clear is absent when there is nothing to clear; Undo exists only while actionable. A disabled button would represent nothing real, and `disabled` buttons drop out of the tab order, which would harm keyboard users. |
| second-Clear-during-window | identical to cleared-with-undo | `Activity cleared.`, `Undo` | `Undo` | Undo restores both clears | snapshot merged, timer restarted |
| new-entry-during-window | header (h2 + Clear), active notice with status + Undo, list with the new entry | `Activity cleared.`, `Undo`, `Clear activity`, new entry | unchanged (still Undo if it had focus) | Undo (restores cleared set, merged with the new entry) or Clear (merge and restart) | `header[h2, button.clear] > notice--active[p.status, button.undo] > ul` |

## Copy inventory

Exactly these strings, no others:

| String | Status | Where |
| --- | --- | --- |
| `Clear activity` | proposed (spec) | button text and accessible name |
| `Undo` | proposed (spec) | button text and accessible name |
| `Activity cleared.` | proposed (spec) | status text after clear, also the visible companion to Undo |
| `Activity restored.` | proposed (spec) | status text after undo |
| `No recent activity yet. Actions you take will show up here.` | existing | empty paragraph (unchanged) |
| `Recent Activity` | existing | heading (unchanged) |

No new copy is introduced by this design. Panel labels and notes in `mockup.html` are mockup scaffolding, not product copy.

## Test-collision check

The spec lists the queries the unmodified existing tests rely on. Design check against each:

| Existing query | Design compliance |
| --- | --- |
| `document.querySelector('ul')` / `('li')` null and `queryByRole('list')` null in the empty state | Header row is a `div`, notice row is a `div`, status is a `p`. No `ul`, `li`, `role="list"` or listitem anywhere in the new markup. In the empty state neither button renders. |
| bare `getByText('settings')` | No new string equals `settings`. |
| bare `getByText('just now')` | No new string equals `just now`. |
| `getByRole('list')` must be unique | No second list role. |
| `getByRole('button', { name: 'Toggle email notifications' })` | New button names are `Clear activity` and `Undo`. |
| `getByText('On')` / `Off` | No new string equals `On` or `Off`. |
| `console.error` never called on unmount | Design adds one `setTimeout` owned by the component with `clearTimeout` in cleanup; no logging. |
| `records production settings interactions` renders `<App />` and clicks the toggle | After the click one entry is stored, so `Clear activity` renders; it does not collide with any query in that test. |

## Implementer notes

### CSS to append to `src/activity/ActivityFeed.css` (ready to paste)

```css
/* --- Clear activity + undo window (TEAM-4162) ------------------------ */

/* Section header row: heading left, Clear activity right; wraps when the
   row is narrower than heading + button (happens at 320px). */
.activity-feed__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.5rem;
}

/* The row now owns the 0.5rem bottom gap (0,2,0 beats .settings__section h2
   at 0,1,1). The heading is a tabIndex=-1 landing spot, not a control. */
.activity-feed__header .activity-feed__title {
  min-width: 0;
  margin: 0;
}

.activity-feed__title:focus {
  outline: none;
}

/* Shared pill button (Clear activity, Undo). Rest matches .settings__toggle
   in App.css; min-height 2.75rem = 44px target. */
.activity-feed__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  max-width: 100%;
  min-height: 2.75rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
}

.activity-feed__button:hover,
.activity-feed__button:active {
  background: #0f172a;
  border-color: #0f172a;
  color: #ffffff;
}

.activity-feed__button:focus-visible {
  outline: 2px solid #0f172a;
  outline-offset: 2px;
}

/* Notice row: always mounted; holds the role="status" line and, while the
   undo window is open, the Undo button. Takes vertical space only when the
   component applies the --active modifier. */
.activity-feed__notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin: 0;
}

.activity-feed__notice--active {
  margin-top: 1rem;
}

.activity-feed__status {
  flex: 1 1 auto;
  min-width: 0;
  color: #475569;
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0;
  overflow-wrap: anywhere;
}

.activity-feed__status:empty {
  display: none;
}
```

### JSX sketch (header row, notice row, body slot)

```tsx
const UNDO_WINDOW_MS = 5000

// state: activities (existing), now (existing), isWindowOpen, statusMessage
// refs:  undoSnapshotRef, timerRef, clearButtonRef, undoButtonRef, headingRef, pendingFocusRef

const hasStoredEntries = activities.length > 0   // non-empty slice <=> non-empty store
const isNoticeActive = statusMessage !== '' || isWindowOpen

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

    <div className={isNoticeActive ? 'activity-feed__notice activity-feed__notice--active' : 'activity-feed__notice'}>
      <p role="status" className="activity-feed__status">{statusMessage}</p>
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
```

Behavioral notes for the implementer (not designed here, listed so the design's focus table holds):

- `handleClear`: `const removed = clearActivities()`; merge into `undoSnapshotRef.current`; `setStatusMessage('Activity cleared.')`; `setIsWindowOpen(true)`; clear then restart `timerRef` with `UNDO_WINDOW_MS`; set `pendingFocusRef.current = 'undo'`.
- `handleUndo`: `restoreActivities(undoSnapshotRef.current ?? [])`; null the snapshot; clear the timer; `setIsWindowOpen(false)`; `setStatusMessage('Activity restored.')`; `pendingFocusRef.current = 'clear'`.
- Timer callback: `const undoHadFocus = document.activeElement === undoButtonRef.current` first; then null the snapshot, `setIsWindowOpen(false)`, `setStatusMessage('')`; if `undoHadFocus`, `headingRef.current?.focus()` (the heading is still mounted, so this can run synchronously).
- A `useEffect` with `[isWindowOpen, hasStoredEntries]` consumes `pendingFocusRef` and calls `.focus()` on the matching ref once it exists.
- Unmount cleanup clears `timerRef`. Each effect invocation owns its own id (StrictMode-safe, same pattern as the existing interval).
- The existing `aria-live="polite"` on the `ul` is unchanged.
- Store functions `clearActivities` and `restoreActivities` are per the spec and are out of this document's scope.

## Concerns

Spec concerns carried forward with this design's recommendation, plus new rows introduced here.

| # | Concern | Policy | Owner | Proposed resolution (spec) | Design recommendation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Brand rules 1 and 2: the brand kit object `branding-kit/brand-system.md` is missing and the prefix is empty, so the labels `Clear activity` and `Undo`, the status strings `Activity cleared.` and `Activity restored.`, and the reuse of existing raw CSS values (`#0f172a`, `#475569`, `#e2e8f0`, `#ffffff`, `0.75rem`, `0.875rem`, `999px`) could not be checked against approved vocabulary or tokens. | Brand | human:brand-lead | Approve the labels and status strings as written (the labels are the intent's own words) and the existing values as-is. Alternative: publish the kit and re-check before Plan Approval. | Carried forward as-is. This design adds no copy and no color/font/icon beyond the listed values. | open |
| 2 | UX rule 14: a destructive action without an explicit confirmation dialog; the intent specifies undo as the safety net instead of a confirm step. | UX | human:design-lead | Accept undo-only. Alternative: add a confirm step that names the object being cleared. | Undo-only. The feed is a low-stakes device-local log, the intent names undo as the safety net, and a confirm dialog plus undo would be two interruptions for one action; undo also keeps the flow keyboard-simple (no dialog focus trap). | open |
| 3 | UX rule 12: the Undo affordance auto-dismisses after 5000 ms and is not also available in a persistent location. | UX | human:design-lead | 5000 ms meets the rule's five second floor; the designer may pause the countdown while Undo has focus or hover. Alternative: lengthen the window to 8 seconds. | Keep the fixed 5000 ms as specified for v1. Do NOT pause on focus: R6 moves focus onto `Undo` automatically after every clear, so a focus-pause would make the window effectively unbounded for all users until they move focus, contradicting R2's "exactly UNDO_WINDOW_MS" and making R6's expiry-while-focused path unreachable. A pointer-hover pause on the undo region is safe and optional: implementer clears the timer on `pointerenter` and restarts a fresh `UNDO_WINDOW_MS` on `pointerleave`, leaving the constant and the 4999/5000 ms boundary tests unchanged when no hover is present. If the design lead wants more time, lengthening the constant is the cleaner lever. | open |
| 5 | Intent ambiguity: "Keyboard and screen-reader users can do both" is satisfied by native buttons plus a `role="status"` element; the spec chooses not to move focus into a live region and not to add `aria-live` to the Undo button itself. | UX | human:design-lead | Accept as specified. Alternative: move focus into the live region on clear. | Accept as specified. Focus lands on the real control (`Undo`), the status element announces the state change, and the always-mounted status paragraph makes that announcement reliable. Moving focus into a live region would double-announce and take focus off the action. | open |
| 7 (new) | R2 says the Undo affordance "replaces the empty-state paragraph". Read literally (undo region rendered only in the body slot), a new entry arriving during the window would replace the undo region with the list and the `Undo` button would vanish while the snapshot is still restorable (R5 keeps the window open). Related to spec Concern 6. | UX | human:product-owner | n/a (design-introduced) | Render the notice row (status + Undo) above the list slot, as this design specifies. While the window is open and entries exist, `Undo`, `Clear activity` and the list are all visible; Undo restores the cleared set merged with the new entry, Clear merges and restarts. The empty paragraph is still suppressed while the window is open, which satisfies R2's intent. Alternative: literal reading, accepting that Undo disappears on a new entry. | open |
| 8 (new) | The spec's UX answer assumes the heading and `Clear activity` stay on one line at 320 px. Measured in Chromium with the existing type tokens: heading 154 px + 1rem gap + button 120 px = 290 px against a 222 px card inner width, so they cannot share a line at 320 px (they fit down to about 388 px viewport). | UX | human:design-lead | n/a (design-introduced) | Accept `flex-wrap`: the button drops to a second line under the heading, left-aligned, 0.5rem below, with no horizontal scroll (verified, `scrollWidth` 320 at 320 px and at 200% text zoom). Alternatives would need a smaller heading or a shorter label, both outside the token and copy constraints. | open |
| 9 (new) | Two numeric values not present in the current CSS: `min-height: 2.75rem` (44 px target on the new buttons) and `outline: 2px` / `outline-offset: 2px` (focus ring). Neither is a color, font or icon, so they are allowed under the spec's token rule, but they are new raw values and the 44 px pill is 12 px taller than the 32 px toggle in the General card. | Brand / UX | human:brand-lead | n/a (design-introduced) | Approve both values. 44 px is the spec's preferred target and 2 px is the conventional minimum for a visible focus ring. If a 32 px visual match with the toggle is preferred, use the pseudo-element hit-area alternative described under "Clear button" instead of `min-height`. | open |

Spec Concerns 4 (reload inside the window) and 6 (second Clear merge and restart) are unchanged by this design and are not repeated; the design renders both behaviors as specified (Concern 6's merge shows as the same cleared-with-undo state).

## Mockup index

All files live beside this document in `.sdlc/wf_1788731227559_dowtdh/design/` on the feature branch (S3 mirror: `workflows/wf_1788731227559_dowtdh/shared/design-mockup.png`, `workflows/wf_1788731227559_dowtdh/shared/mockup.html`).

| File | What it shows |
| --- | --- |
| `frontend-designer.md` | this document |
| `mockup.html` | standalone, no Tailwind; hand-written CSS that copies `App.css` and `ActivityFeed.css` verbatim plus the proposed delta; five labelled panels: (a) default, (b) empty, (c) cleared with Undo showing the focus-visible ring, (d) restored with `Activity restored.` and Clear focused, (e) undo region hover/active |
| `mockup-320.html` | the Activity card only, states (a) and (c), generated from the same CSS block |
| `design-mockup.png` | `mockup.html` at 1440 x 900, full page |
| `design-mockup-320.png` | `mockup-320.html` at 320 px viewport, full page; measured `scrollWidth` 320 (no horizontal scroll); header row wrapped, Clear 120 x 44 px, Undo 65 x 44 px |
| `design-mockup-zoom200.png` | same page with root font-size 32 px to simulate 200% text zoom; measured `scrollWidth` 320, no element past 320 px; Clear pill wraps to two lines at 126 x 106 px |

Rendering note: the runtime has no Inter font installed, so the screenshots fall back to `system-ui`. Widths in the tables were measured with that fallback and may differ by a few pixels under Inter; the wrap behavior does not depend on them.
