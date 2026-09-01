import { useEffect, useState } from 'react'
import { getActivities, subscribe, type Activity } from './activity'

const MAX_VISIBLE_ACTIVITIES = 20

function getRelativeTime(timestamp: number) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))

  if (elapsedSeconds < 60) {
    return 'just now'
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)

  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`
  }

  return `${Math.floor(elapsedHours / 24)}d ago`
}

function getVisibleActivities() {
  return getActivities().slice(0, MAX_VISIBLE_ACTIVITIES)
}

function ActivityFeedItem({ activity }: { activity: Activity }) {
  return (
    <li className="activity-feed__item">
      <div className="activity-feed__content">
        <span className="activity-feed__type">{activity.type}</span>
        <p className="activity-feed__description">{activity.description}</p>
      </div>
      <time className="activity-feed__time" dateTime={new Date(activity.timestamp).toISOString()}>
        {getRelativeTime(activity.timestamp)}
      </time>
    </li>
  )
}

export function ActivityFeed() {
  const [activities, setActivities] = useState(getVisibleActivities)

  useEffect(() => {
    return subscribe(() => {
      setActivities(getVisibleActivities())
    })
  }, [])

  return (
    <section className="settings__section activity-feed" aria-labelledby="activity-feed-title">
      <h2 id="activity-feed-title">Recent Activity</h2>
      {activities.length > 0 ? (
        <ul className="activity-feed__list" aria-live="polite">
          {activities.map((activity) => (
            <ActivityFeedItem key={activity.id} activity={activity} />
          ))}
        </ul>
      ) : (
        <p className="activity-feed__empty">No recent activity yet. Actions you take will show up here.</p>
      )}
    </section>
  )
}
