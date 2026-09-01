import './App.css'
import ActivityFeed from './activity/ActivityFeed'

function App() {
  return (
    <div className="app">
      <div className="settings">
        <h1 className="settings__title">Settings</h1>
        <section className="settings__section">
          <h2>General</h2>
          <p>Application settings will appear here.</p>
        </section>
        <ActivityFeed />
      </div>
    </div>
  )
}

export default App
