import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import './Settings.css';

export function Settings() {
  return (
    <div className="settings">
      <h1 className="settings__title">Settings</h1>

      <section className="settings__section">
        <h2 className="settings__section-title">Appearance</h2>
        <p className="settings__section-description">
          Customize how the app looks on your device.
        </p>

        <div className="settings__option">
          <div className="settings__option-info">
            <label className="settings__option-label">Theme</label>
            <span className="settings__option-hint">
              Select your preferred color scheme
            </span>
          </div>
          <ThemeToggle />
        </div>
      </section>
    </div>
  );
}
