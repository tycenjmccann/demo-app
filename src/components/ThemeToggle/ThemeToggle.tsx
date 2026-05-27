import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ThemePreference, applyTheme, getStoredPreference, initTheme, onSystemPreferenceChange, setStoredPreference } from '../../utils/theme';
import './ThemeToggle.css';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const [selected, setSelected] = useState<ThemePreference>(() => {
    return getStoredPreference() || 'system';
  });
  const indicatorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preference = initTheme();
    setSelected(preference);
  }, []);

  useEffect(() => {
    if (selected === 'system') {
      const cleanup = onSystemPreferenceChange(() => {
        applyTheme('system', false);
      });
      return cleanup;
    }
  }, [selected]);

  const updateIndicator = useCallback(() => {
    if (!containerRef.current || !indicatorRef.current) return;
    const selectedBtn = containerRef.current.querySelector(`[data-value="${selected}"]`) as HTMLElement;
    if (!selectedBtn) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const btnRect = selectedBtn.getBoundingClientRect();

    indicatorRef.current.style.width = `${btnRect.width}px`;
    indicatorRef.current.style.transform = `translateX(${btnRect.left - containerRect.left - 4}px)`;
  }, [selected]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  const handleSelect = (value: ThemePreference) => {
    setSelected(value);
    setStoredPreference(value);
    applyTheme(value, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let newIndex = currentIndex;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = (currentIndex + 1) % OPTIONS.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = (currentIndex - 1 + OPTIONS.length) % OPTIONS.length;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(OPTIONS[currentIndex].value);
      return;
    } else {
      return;
    }

    handleSelect(OPTIONS[newIndex].value);
    const btns = containerRef.current?.querySelectorAll('.theme-toggle__segment');
    (btns?.[newIndex] as HTMLElement)?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="theme-toggle"
      role="radiogroup"
      aria-label="Theme preference"
    >
      <div ref={indicatorRef} className="theme-toggle__indicator" aria-hidden="true" />
      {OPTIONS.map((option, index) => {
        const Icon = option.icon;
        const isSelected = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className="theme-toggle__segment"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${option.label} theme`}
            data-value={option.value}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => handleSelect(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="theme-toggle__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
