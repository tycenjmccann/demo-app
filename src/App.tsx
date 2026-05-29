import { useState } from 'react'
import { LoginScreen } from './components/LoginScreen/LoginScreen'
import './App.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  if (!isAuthenticated) {
    return (
      <div className="app">
        <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="settings">
        <h1 className="settings__title">Settings</h1>
        <section className="settings__section">
          <h2>General</h2>
          <p>Application settings will appear here.</p>
        </section>
      </div>
    </div>
  )
}

export default App
