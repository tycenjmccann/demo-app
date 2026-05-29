import { useState, FormEvent } from 'react'
import './LoginScreen.css'

interface LoginScreenProps {
  onLoginSuccess: () => void
}

async function loginApi(email: string, password: string): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (email && password) {
        resolve({ success: true })
      } else {
        resolve({ success: false })
      }
    }, 800)
  })
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await loginApi(email, password)

    if (result.success) {
      onLoginSuccess()
    } else {
      setError('Invalid email or password')
    }

    setLoading(false)
  }

  return (
    <div className="login">
      <h1 className="login__title">Login</h1>
      <form className="login__form" onSubmit={handleSubmit}>
        <div className="login__field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="login__field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        {error && <p className="login__error">{error}</p>}
        <button type="submit" className="login__button" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}
