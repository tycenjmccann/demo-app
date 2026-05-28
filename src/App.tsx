import { useTheme } from './context/ThemeContext'
import ToggleSwitch from './components/ToggleSwitch'
import './App.css'

function App() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app">
      <div className="settings">
        <header className="settings__header">
          <h1 className="settings__title">Settings</h1>
          <p className="settings__subtitle">Manage your preferences</p>
        </header>
        <section className="settings__section">
          <h2 className="settings__section-title">Appearance</h2>
          <div className="settings__row">
            <div className="settings__row-text">
              <span className="settings__row-label" id="dark-mode-label">Dark Mode</span>
              <span className="settings__row-description" id="dark-mode-desc">Switch between light and dark theme</span>
            </div>
            <ToggleSwitch checked={theme === 'dark'} onChange={toggleTheme} />
          </div>
        </section>
        <section className="settings__section">
          <h2 className="settings__section-title">Notifications</h2>
          <p className="settings__placeholder">Notification preferences will appear here.</p>
        </section>
      </div>
    </div>
  )
}

export default App
