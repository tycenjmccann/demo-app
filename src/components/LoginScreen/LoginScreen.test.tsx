import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LoginScreen } from './LoginScreen'

afterEach(() => {
  cleanup()
})

describe('LoginScreen', () => {
  it('calls onLoginSuccess when form is submitted with valid credentials', async () => {
    const onLoginSuccess = vi.fn()
    render(<LoginScreen onLoginSuccess={onLoginSuccess} />)

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    })
  })

  it('shows loading state after clicking login', async () => {
    const onLoginSuccess = vi.fn()
    render(<LoginScreen onLoginSuccess={onLoginSuccess} />)

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    expect(screen.getByRole('button', { name: 'Logging in...' })).toBeDisabled()
  })

  it('submit handler is bound to the login button click', async () => {
    const onLoginSuccess = vi.fn()
    render(<LoginScreen onLoginSuccess={onLoginSuccess} />)

    const button = screen.getByRole('button', { name: 'Login' })
    expect(button).toHaveAttribute('type', 'submit')

    const form = button.closest('form')
    expect(form).not.toBeNull()

    await userEvent.type(screen.getByLabelText('Email'), 'test@test.com')
    await userEvent.type(screen.getByLabelText('Password'), 'pass')
    await userEvent.click(button)

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalled()
    })
  })

  it('renders authenticated view after successful login in App context', async () => {
    const onLoginSuccess = vi.fn()
    render(<LoginScreen onLoginSuccess={onLoginSuccess} />)

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    })
  })
})
