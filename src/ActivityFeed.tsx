import { useEffect, useState } from 'react'
import { getActivities, relativeTime, subscribe } from './activity'

/** Entries rendered at most, independent of how many are persisted. */
const MAX_VISIBLE = 20

function ActivityFeed() {
  const [entries, setEntries] = useState(getActivities)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const sync = () => {
      setEntries(getActivities())
      setNow(Date.now())
    }
    sync()
    return subscribe(sync)
  }, [])

  const items = entries.slice(0, MAX_VISIBLE)

  return (
    <section className="settings__section activity-feed" aria-labelledby="activity-heading">
      <h2 id="activity-heading">Recent Activity</h2>
      {items.length === 0
        ? <p className="activity-feed__empty">No recent activity yet.</p>
        : <ul className="activity-feed__list" aria-live="polite" aria-relevant="additions">
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
    </section>
  )
}

export default ActivityFeed
