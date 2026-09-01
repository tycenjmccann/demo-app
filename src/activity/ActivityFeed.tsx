import { useEffect, useState } from 'react'
import { getActivities, subscribe, type Activity } from './activityStore'
import { formatRelativeTime } from './formatRelativeTime'
import './ActivityFeed.css'

const MAX_VISIBLE_ACTIVITIES = 20

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

  return (
    <section className="settings__section activity-feed" aria-labelledby="activity-feed-title">
      <h2 id="activity-feed-title">Recent Activity</h2>
      {activities.length > 0 ? (
        <ul className="activity-feed__list" aria-live="polite">
          {activities.map((activity) => (
            <ActivityFeedItem key={activity.id} activity={activity} now={now} />
          ))}
        </ul>
      ) : (
        <p className="activity-feed__empty">No recent activity yet. Actions you take will show up here.</p>
      )}
    </section>
  )
}

export default ActivityFeed
