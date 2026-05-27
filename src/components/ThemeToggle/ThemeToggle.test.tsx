import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders three theme options', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: /light theme/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /dark theme/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /system theme/i })).toBeInTheDocument();
  });

  it('has radiogroup role with label', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radiogroup', { name: /theme preference/i })).toBeInTheDocument();
  });

  it('defaults to system when nothing stored', () => {
    render(<ThemeToggle />);
    const systemBtn = screen.getByRole('radio', { name: /system theme/i });
    expect(systemBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('selects stored preference on mount', () => {
    localStorage.setItem('theme-preference', 'dark');
    render(<ThemeToggle />);
    const darkBtn = screen.getByRole('radio', { name: /dark theme/i });
    expect(darkBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('changes theme on click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const darkBtn = screen.getByRole('radio', { name: /dark theme/i });
    await user.click(darkBtn);

    expect(darkBtn).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('theme-preference')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('supports keyboard navigation with arrow keys', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const systemBtn = screen.getByRole('radio', { name: /system theme/i });
    systemBtn.focus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: /dark theme/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('updates localStorage on selection', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('radio', { name: /light theme/i }));
    expect(localStorage.getItem('theme-preference')).toBe('light');
  });
});
