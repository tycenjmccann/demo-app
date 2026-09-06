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
    setStatusMessage('Activity cleared.')
    setIsWindowOpen(true)
    setUndoWindowKey((key) => key + 1)
    pendingFocusRef.current = 'undo'
  }

  function handleUndo() {
    const snapshot = undoSnapshotRef.current ?? []
    const restored = restoreActivities(snapshot)

    undoSnapshotRef.current = null
    // Queued last for the same reason as in handleClear (spec R8).
    setActivities(restored.slice(0, MAX_VISIBLE_ACTIVITIES))
    setIsWindowOpen(false)
    setStatusMessage('Activity restored.')
    pendingFocusRef.current = 'clear'
  }

  // Undo window timer. Each effect invocation owns and clears its own timeout
  // id, so it is StrictMode-safe and cleans up on unmount for free — the same
  // pattern as the REFRESH_INTERVAL_MS interval above (spec R3). Bumping
  // undoWindowKey re-runs this effect, which restarts the window on a second
  // clear.
  useEffect(() => {
    if (!isWindowOpen) {
      return
    }

    const timeoutId = setTimeout(() => {
      // Read the focus owner BEFORE any state update unmounts the Undo button.
      const undoHadFocus = document.activeElement === undoButtonRef.current

      undoSnapshotRef.current = null
      setIsWindowOpen(false)
      // Removing the text announces nothing, which is what R7 requires for
      // expiry.
      setStatusMessage('')

      if (undoHadFocus) {
        // The heading is always mounted and carries tabIndex={-1}, so focus is
        // never dropped to document.body.
        headingRef.current?.focus()
      }
    }, UNDO_WINDOW_MS)

    return () => clearTimeout(timeoutId)
  }, [isWindowOpen, undoWindowKey])

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
          before its text changes, which makes announcements reliable. */}
      <div
        className={
          isNoticeActive ? 'activity-feed__notice activity-feed__notice--active' : 'activity-feed__notice'
        }
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
