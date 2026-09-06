import { useCallback, useEffect, useRef, useState } from 'react'
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
  // Defense in depth (TEAM-3658): even though the store rejects out-of-range
  // timestamps, guard the Date conversion here so a bad value can never throw
  // a RangeError from toISOString()/toString() at render. Only emit dateTime /
  // title when the Date is valid.
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
  // `now` drives the relative-time labels. It advances on store changes and on
  // the periodic refresh tick below.
  const [now, setNow] = useState<number>(() => Date.now())

  // TEAM-4162 undo window state.
  const [isWindowOpen, setIsWindowOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<StatusMessage>('')
  // Bumped on every clear so the timer effect re-runs and the window restarts
  // when a second clear lands while a window is already open.
  const [undoWindowKey, setUndoWindowKey] = useState(0)
  // TEAM-4183 F1: true while the pointer rests on the notice row, which pauses
  // the countdown (PO decision, TEAM-4174 Concern 3).
  const [isPaused, setIsPaused] = useState(false)
  // TEAM-4183 F2b: a status string waiting to be re-set on the next tick so a
  // repeated message is a real DOM mutation and therefore re-announced.
  const [pendingStatus, setPendingStatus] = useState<StatusMessage | null>(null)

  // The undo snapshot lives in memory only and is never written to storage, so
  // a reload inside the window loses the ability to undo (spec R4, Concern 4).
  const undoSnapshotRef = useRef<Activity[] | null>(null)
  const clearButtonRef = useRef<HTMLButtonElement>(null)
  const undoButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocusRef = useRef<'undo' | 'clear' | null>(null)

  useEffect(() => {
    // Refresh on mount in case the store changed between the initial render
    // and this effect, and establish the live subscription.
    setActivities(getVisibleActivities())
    setNow(Date.now())

    const unsubscribe = subscribe(() => {
      setActivities(getVisibleActivities())
      setNow(Date.now())
    })

    // P2: periodic refresh. setInterval is idempotent under StrictMode's
    // double-invoked effects because each effect invocation creates and clears
    // its own timer id in the matching cleanup, so no timer leaks and no
    // duplicate intervals survive.
    const intervalId = setInterval(() => {
      setNow(Date.now())
    }, REFRESH_INTERVAL_MS)

    return () => {
      unsubscribe()
      clearInterval(intervalId)
    }
  }, [])

  // A non-empty visible slice implies a non-empty store, because
  // slice(0, MAX_VISIBLE_ACTIVITIES) of a non-empty array is non-empty. So this
  // gates the Clear control on the full stored count without a second read.
  const hasStoredEntries = activities.length > 0
  const isNoticeActive = statusMessage !== '' || isWindowOpen

  /**
   * Close the undo window without restoring anything: drop the snapshot, hide
   * the Undo affordance, remove the status text (removing text announces
   * nothing — R7), cancel any pending re-announce, and clear the hover pause.
   *
   * Shared by the expiry timer and by the empty-snapshot Undo path so both
   * behave identically (TEAM-4183 F3). Only refs and state setters are touched,
   * all of which are stable, so an empty dependency list is correct.
   */
  const closeWindow = useCallback(() => {
    // Read the focus owner BEFORE any state update unmounts the Undo button.
    const undoHadFocus = document.activeElement === undoButtonRef.current

    undoSnapshotRef.current = null
    setIsWindowOpen(false)
    setStatusMessage('')
    setPendingStatus(null)
    setIsPaused(false)

    if (undoHadFocus) {
      // The heading is always mounted and carries tabIndex={-1}, so focus is
      // never dropped to document.body.
      headingRef.current?.focus()
    }
  }, [])

  function handleClear() {
    const removed = clearActivities()

    // Merge into any snapshot from an earlier clear in this window, newest
    // clear first, so a later Undo restores everything cleared across clears.
    undoSnapshotRef.current = [...removed, ...(undoSnapshotRef.current ?? [])]

    // The store's synchronous notifySubscribers() has already queued
    // setActivities(getVisibleActivities()), which RE-READS storage. If the
    // write failed, that re-read still sees the old entries. Queueing our own
    // value last means it wins inside this event's batch, so the list empties
    // in memory even when persistence degraded (spec R8). On the success path
    // both values are identical.
    setActivities([])

    // TEAM-4183 F2b: re-setting the identical string is not a DOM mutation, so
    // a screen reader would not re-announce a second clear inside an open
    // window. Blank the region now and re-set it on the next tick, which is a
    // real mutation. Any other prior status (first clear, or a clear right
    // after an undo) changes the text on its own, so it stays synchronous —
    // the existing tests assert that text synchronously.
    if (statusMessage === 'Activity cleared.') {
      setStatusMessage('')
      setPendingStatus('Activity cleared.')
    } else {
      setStatusMessage('Activity cleared.')
      setPendingStatus(null)
    }

    setIsWindowOpen(true)
    setUndoWindowKey((key) => key + 1)
    // Never inherit a stale pause: if the pointer was resting on the notice row
    // when the Undo button unmounted under it, no pointerleave fires and the
    // next window would never expire (TEAM-4183 F1).
    setIsPaused(false)
    pendingFocusRef.current = 'undo'
  }

  function handleUndo() {
    const snapshot = undoSnapshotRef.current

    // Nothing to restore (e.g. the storage read failed when Clear was pressed,
    // so clearActivities() reported no removed entries). Close the window the
    // way expiry does rather than announcing a restore that did not happen and
    // aiming focus at a Clear button that is not mounted (TEAM-4183 F3).
    if (!snapshot || snapshot.length === 0) {
      closeWindow()
      return
    }

    const restored = restoreActivities(snapshot)

    undoSnapshotRef.current = null
    // Queued last for the same reason as in handleClear (spec R8).
    setActivities(restored.slice(0, MAX_VISIBLE_ACTIVITIES))
    setIsWindowOpen(false)
    setStatusMessage('Activity restored.')
    setPendingStatus(null)
    setIsPaused(false)
    pendingFocusRef.current = 'clear'
  }

  // Undo window timer. Each effect invocation owns and clears its own timeout
  // id, so it is StrictMode-safe and cleans up on unmount for free — the same
  // pattern as the REFRESH_INTERVAL_MS interval above (spec R3). Bumping
  // undoWindowKey re-runs this effect, which restarts the window on a second
  // clear.
  //
  // TEAM-4183 F1: `isPaused` is a dependency, so pointerenter on the notice row
  // tears the timer down and pointerleave re-runs the effect with a FRESH
  // UNDO_WINDOW_MS. Restarting rather than resuming is what the design sketches
  // (Concern 3) and it needs no elapsed-time bookkeeping. With no pointer
  // involved the effect is byte-for-byte the old one, so the 4999/5000 ms
  // boundary is unchanged.
  useEffect(() => {
    if (!isWindowOpen || isPaused) {
      return
    }

    const timeoutId = setTimeout(closeWindow, UNDO_WINDOW_MS)

    return () => clearTimeout(timeoutId)
  }, [isWindowOpen, undoWindowKey, isPaused, closeWindow])

  // TEAM-4183 F2b: re-set a repeated status string one tick later so the live
  // region sees a genuine text mutation. Effect-owned id, so it is cancelled by
  // unmount, by Undo and by expiry (both null `pendingStatus`) exactly like the
  // window timer above. `isNoticeActive` stays true across the blank tick
  // because `isWindowOpen` is true, so the row does not collapse and reflow.
  useEffect(() => {
    if (pendingStatus === null) {
      return
    }

    const timeoutId = setTimeout(() => {
      setStatusMessage(pendingStatus)
      setPendingStatus(null)
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [pendingStatus])

  // Move focus once the target button has mounted. The dependencies change
  // exactly when that happens: isWindowOpen for Undo, hasStoredEntries for the
  // Clear button reappearing after an undo.
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
          <button
            type="button"
            className="activity-feed__button"
            ref={clearButtonRef}
            onClick={handleClear}
          >
            Clear activity
          </button>
        )}
      </div>

      {/* Always mounted so the live region exists in the accessibility tree
          before its text changes, which makes announcements reliable. The
          status paragraph is also always RENDERED (never display:none) — see
          the note in ActivityFeed.css (TEAM-4183 F2).

          Pointer enter/leave pause the countdown while the pointer rests on
          this row, so the Undo pill cannot expire from under the cursor
          (TEAM-4183 F1). Hovering while no window is open is inert: the timer
          effect has nothing to tear down, and handleClear resets the flag. */}
      <div
        className={
          isNoticeActive ? 'activity-feed__notice activity-feed__notice--active' : 'activity-feed__notice'
        }
        onPointerEnter={() => setIsPaused(true)}
        onPointerLeave={() => setIsPaused(false)}
      >
        <p role="status" className="activity-feed__status">
          {statusMessage}
        </p>
        {isWindowOpen && (
          <button
            type="button"
            className="activity-feed__button"
            ref={undoButtonRef}
            onClick={handleUndo}
          >
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
