import './App.css'
import { useEffect, useState } from 'react'
import { ActivityFeed } from './activity/ActivityFeed'
import { addActivity } from './activity/activityStore'
import { formatRelativeTime } from './activity/formatRelativeTime'
import {
  readEmailNotificationsSetting,
  writeEmailNotificationsSetting,
  type EmailNotificationsSetting,
} from './settings/emailNotificationsStore'

// Matches ActivityFeed's REFRESH_INTERVAL_MS so the "Last changed" label and
// the feed's relative labels recompute on the same cadence, and neither can get
// stuck reading "just now" forever.
const REFRESH_INTERVAL_MS = 30_000

function App() {
  // Lazy initializer: the persisted value is read during the very first render,
  // so the toggle paints its real state immediately instead of flashing Off and
  // then correcting itself. null means "nothing persisted or unusable", which
  // keeps a persisted `enabled: false` distinguishable from a missing key.
  const [emailNotificationsSetting, setEmailNotificationsSetting] =
    useState<EmailNotificationsSetting | null>(() => readEmailNotificationsSetting())
  // `now` drives the relative-time label. It only advances on the periodic tick
  // below; the tick never writes storage and never records activity.
  const [now, setNow] = useState<number>(() => Date.now())

  const emailNotificationsEnabled = emailNotificationsSetting?.enabled ?? false

  useEffect(() => {
    // Each effect invocation creates and clears its own timer id in the
    // matching cleanup, so StrictMode's double-invoked effects leave no
    // duplicate intervals and nothing leaks on unmount.
    const intervalId = setInterval(() => {
      setNow(Date.now())
    }, REFRESH_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  function handleEmailNotificationsToggle() {
    const nextIsEnabled = !emailNotificationsEnabled

    // addActivity comes first because the persisted lastChangedAt must be that
    // entry's own timestamp, not a second independent Date.now() reading.
    const activity = addActivity(
      'settings',
      nextIsEnabled ? 'Turned email notifications on.' : 'Turned email notifications off.',
    )

    writeEmailNotificationsSetting({ enabled: nextIsEnabled, lastChangedAt: activity.timestamp })
    setEmailNotificationsSetting({ enabled: nextIsEnabled, lastChangedAt: activity.timestamp })
  }

  // Defense in depth, mirroring ActivityFeedItem: even though the store rejects
  // out-of-range timestamps, guard the Date conversion so a bad value can never
  // throw a RangeError from toISOString()/toString() at render.
  const lastChangedDate =
    emailNotificationsSetting !== null ? new Date(emailNotificationsSetting.lastChangedAt) : null
  const isValidLastChangedDate =
    lastChangedDate !== null && !Number.isNaN(lastChangedDate.getTime())

  return (
    <div className="app">
      <div className="settings">
        <h1 className="settings__title">Settings</h1>
        <section className="settings__section">
          <h2>General</h2>
          <p>Application settings will appear here.</p>
          <div className="settings__control">
            <div>
              <h3 className="settings__control-title">Email notifications</h3>
              <p className="settings__control-description">Receive updates about important account activity.</p>
            </div>
            <button
              type="button"
              className="settings__toggle"
              aria-label="Toggle email notifications"
              aria-pressed={emailNotificationsEnabled}
              onClick={handleEmailNotificationsToggle}
            >
              {emailNotificationsEnabled ? 'On' : 'Off'}
            </button>
          </div>
          {emailNotificationsSetting !== null && (
            <p className="settings__control-meta">
              Last changed{' '}
              <time
                dateTime={
                  isValidLastChangedDate && lastChangedDate !== null
                    ? lastChangedDate.toISOString()
                    : undefined
                }
                title={
                  isValidLastChangedDate && lastChangedDate !== null
                    ? lastChangedDate.toString()
                    : undefined
                }
              >
                {formatRelativeTime(emailNotificationsSetting.lastChangedAt, now)}
              </time>
            </p>
          )}
        </section>
        <ActivityFeed />
      </div>
    </div>
  )
}

export default App
