import { type KeyboardEvent } from 'react'
import './ToggleSwitch.css'

interface ToggleSwitchProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  id?: string
}

export default function ToggleSwitch({ checked, onChange, disabled, id }: ToggleSwitchProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (!disabled) {
        onChange()
      }
    }
  }

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-labelledby="dark-mode-label"
      aria-describedby="dark-mode-desc"
      className={`toggle-switch ${checked ? 'toggle-switch--on' : ''}`}
      onClick={onChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      id={id}
    >
      <span className="toggle-switch__thumb" aria-hidden="true"></span>
    </button>
  )
}
