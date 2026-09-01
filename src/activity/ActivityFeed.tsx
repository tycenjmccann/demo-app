import { useEffect, useState } from 'react'
import { getActivities, subscribe, type ActivityEntry } from './activityStore'
import { formatRelativeTime } from './formatRelativeTime'
import './ActivityFeed.css'

const MAX_VISIBLE = 20

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityEntry[]>(() =>
    getActivities(),
  )

  useEffect(() => {
    // Refresh on mount in case the store changed between initial render and
    // effect (and to establish the live subscription).
    setActivities(getActivities())
    const unsubscribe = subscribe(() => {
      setActivities(getActivities())
    })
    // Cleanup on unmount; unsubscribe is idempotent / StrictMode-safe.
    return unsubscribe
  }, [])

  const visible = activities.slice(0, MAX_VISIBLE)
  const now = Date.now()

  return (
    <section className="settings__section">
      <h2>Recent Activity</h2>
      {visible.length === 0 ? (
        <p className="activity-feed__empty">No recent activity yet.</p>
      ) : (
        <ul className="activity-feed">
          {visible.map((activity) => {
            // Defense in depth: even though the store rejects out-of-range
            // timestamps, guard the Date conversion here so a bad value can
            // never throw RangeError from toISOString()/toString() at render.
            const date = new Date(activity.timestamp)
            const isValidDate = !Number.isNaN(date.getTime())
            return (
              <li key={activity.id} className="activity-feed__item">
                <span className="activity-feed__type">{activity.type}</span>
                <span className="activity-feed__desc">{activity.description}</span>
                <time
                  className="activity-feed__time"
                  dateTime={isValidDate ? date.toISOString() : undefined}
                  title={isValidDate ? date.toString() : undefined}
                >
                  {formatRelativeTime(activity.timestamp, now)}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default ActivityFeed
