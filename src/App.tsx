import { useState } from 'react'
import ActivityFeed from './ActivityFeed'
import { addActivity } from './activity'
import './App.css'

function App() {
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false)

  function handleEmailNotificationsToggle() {
    const nextIsEnabled = !emailNotificationsEnabled

    setEmailNotificationsEnabled(nextIsEnabled)
    addActivity(
      'settings',
      nextIsEnabled ? 'Turned email notifications on.' : 'Turned email notifications off.',
    )
  }

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
        </section>
        <ActivityFeed />
      </div>
    </div>
  )
}

export default App
