import { useEffect, useState } from 'react'
import { getActivities, relativeTime, subscribe } from './activity'

/** Entries rendered at most, independent of how many are persisted. */
const MAX_VISIBLE = 20

/** How often the displayed relative times are refreshed while idle. */
const TICK_INTERVAL = 30_000

function ActivityFeed() {
  const [entries, setEntries] = useState(getActivities)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const sync = () => {
      setEntries(getActivities())
      setNow(Date.now())
    }
    sync()
    const unsubscribe = subscribe(sync)
    // Advance the relative-time labels while idle: without this, "just now"
    // would never age until the next addActivity notification arrived.
    const interval = setInterval(() => setNow(Date.now()), TICK_INTERVAL)
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const items = entries.slice(0, MAX_VISIBLE)

  return (
    <section className="settings__section activity-feed" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Recent Activity</h2>
      {/* Persistently-mounted live region: the first entry added from the empty
          state is an UPDATE to this container, so screen readers announce it. */}
      <div className="activity-feed__body" aria-live="polite" aria-relevant="additions">
        {items.length === 0
          ? <p className="activity-feed__empty">No recent activity yet.</p>
          : <ul className="activity-feed__list">
              {items.map(item => (
                <li className="activity-feed__item" key={item.id}>
                  <span className="activity-feed__type">{item.type}</span>
                  <span className="activity-feed__description">{item.description}</span>
                  <time className="activity-feed__time" dateTime={new Date(item.timestamp).toISOString()} title={new Date(item.timestamp).toLocaleString()}>
                    {relativeTime(item.timestamp, now)}
                  </time>
                </li>
              ))}
            </ul>}
      </div>
    </section>
  )
}

export default ActivityFeed
