import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActivityFeed from './ActivityFeed'
import App from '../App'
import { addActivity, getActivities, type Activity } from './activityStore'

// Unified render test suite combining the TEAM-3628 (main) and TEAM-3630
// (branch) lineages, plus the TEAM-3668 P2 periodic-refresh regression test.

const STORAGE_KEY = 'demo.activity'

function expectActivityTime(description: string, relativeTime: string) {
  const activityItem = screen.getByText(description).closest('li')

  expect(activityItem).not.toBeNull()
  expect(within(activityItem as HTMLElement).getByText(relativeTime)).toBeInTheDocument()
}

describe('ActivityFeed', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- main (TEAM-3628) lineage ---------------------------------------

  it('renders the empty state when there are no activities', () => {
    render(<ActivityFeed />)

    expect(
      screen.getByText('No recent activity yet. Actions you take will show up here.'),
    ).toBeInTheDocument()
  })

  it('live-updates when a new activity is added', () => {
    render(<ActivityFeed />)

    act(() => {
      addActivity('settings', 'Updated notification preferences.')
    })

    expect(screen.getByText('settings')).toBeInTheDocument()
    expect(screen.getByText('Updated notification preferences.')).toBeInTheDocument()
    expect(screen.getByText('just now')).toBeInTheDocument()
  })

  it('records production settings interactions in the recent activity feed', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle email notifications' }))

    expect(screen.getByRole('button', { name: 'Toggle email notifications' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(
      screen.queryByText('No recent activity yet. Actions you take will show up here.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('settings')).toBeInTheDocument()
    expect(screen.getByText('Turned email notifications on.')).toBeInTheDocument()
  })

  it('renders relative timestamps at expected boundaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const now = Date.now()

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'future', type: 'settings', description: 'Future activity.', timestamp: now + 5_000 },
        { id: '59-seconds', type: 'settings', description: '59 seconds old.', timestamp: now - 59_000 },
        { id: '60-seconds', type: 'settings', description: '60 seconds old.', timestamp: now - 60_000 },
        { id: '59-minutes', type: 'settings', description: '59 minutes old.', timestamp: now - 59 * 60_000 },
        { id: '60-minutes', type: 'settings', description: '60 minutes old.', timestamp: now - 60 * 60_000 },
        { id: '23-hours', type: 'settings', description: '23 hours old.', timestamp: now - 23 * 60 * 60_000 },
        { id: '24-hours', type: 'settings', description: '24 hours old.', timestamp: now - 24 * 60 * 60_000 },
      ]),
    )

    render(<ActivityFeed />)

    expectActivityTime('Future activity.', 'just now')
    expectActivityTime('59 seconds old.', 'just now')
    expectActivityTime('60 seconds old.', '1m ago')
    expectActivityTime('59 minutes old.', '59m ago')
    expectActivityTime('60 minutes old.', '1h ago')
    expectActivityTime('23 hours old.', '23h ago')
    expectActivityTime('24 hours old.', '1d ago')
    expect(screen.queryByText(/^-/)).not.toBeInTheDocument()
  })

  it('renders only the 20 most recent activities', () => {
    for (let index = 0; index < 25; index += 1) {
      addActivity('settings', `Activity ${index}`)
    }

    render(<ActivityFeed />)

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(20)
    expect(screen.getByText('Activity 24')).toBeInTheDocument()
    expect(screen.queryByText('Activity 4')).not.toBeInTheDocument()
  })

  it('does not crash when localStorage contains an out-of-range timestamp', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: 'x', type: 't', description: 'd', timestamp: 1e300 }]),
    )

    expect(() => render(<ActivityFeed />)).not.toThrow()
    expect(
      screen.getByText('No recent activity yet. Actions you take will show up here.'),
    ).toBeInTheDocument()
  })

  it('renders out-of-order valid storage newest-first', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'oldest', type: 'settings', description: 'Oldest activity.', timestamp: 1 },
        { id: 'newest', type: 'settings', description: 'Newest activity.', timestamp: 3 },
        { id: 'middle', type: 'settings', description: 'Middle activity.', timestamp: 2 },
      ]),
    )

    render(<ActivityFeed />)

    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.activity-feed__description')?.textContent),
    ).toEqual(['Newest activity.', 'Middle activity.', 'Oldest activity.'])
  })

  it('cleans up its subscription on unmount', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = render(<ActivityFeed />)

    unmount()

    act(() => {
      addActivity('settings', 'Updated after unmount.')
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  // --- branch (TEAM-3630) lineage -------------------------------------

  it('renders the empty state with no list when there are no activities', () => {
    render(<ActivityFeed />)

    // Unified empty-state copy (adopted from main). The structural assertion
    // from the branch — that the empty state renders no list — is preserved.
    expect(
      screen.getByText('No recent activity yet. Actions you take will show up here.'),
    ).toBeInTheDocument()

    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(document.querySelector('ul')).toBeNull()
    expect(document.querySelector('li')).toBeNull()
  })

  it('does not throw when a stored entry has a huge finite timestamp (TEAM-3658)', () => {
    // Regression: an out-of-range but finite timestamp must not crash render.
    // Previously new Date(9e15).toISOString() threw RangeError during render.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'x', type: 'evil', description: 'huge ts', timestamp: 9e15 },
        { id: 'y', type: 'evil', description: 'astronomical ts', timestamp: 1e300 },
        { id: 'z', type: 'evil', description: 'huge negative ts', timestamp: -9e15 },
      ]),
    )

    expect(() => render(<ActivityFeed />)).not.toThrow()
  })

  // --- TEAM-3668 P2: periodic relative-timestamp refresh --------------

  it('refreshes stale relative labels on the periodic timer (P2, TEAM-3668)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    // Seed one entry timestamped "now" so it initially renders "just now".
    addActivity('settings', 'Timer refresh entry.')

    render(<ActivityFeed />)
    expectActivityTime('Timer refresh entry.', 'just now')

    // Advance fake time past 60s + the 30s refresh interval so at least one
    // refresh tick fires after the label should have crossed the 1-minute
    // boundary. Wrap timer advances in act() so React flushes the re-render.
    act(() => {
      vi.advanceTimersByTime(90_000)
    })

    expectActivityTime('Timer refresh entry.', '1m ago')
    expect(screen.queryByText('just now')).not.toBeInTheDocument()
  })
})

// --- TEAM-4162: clear the Activity feed with an undo window ------------

const UNDO_WINDOW_MS = 5000
const BASE_TIME = new Date('2026-01-01T00:00:00.000Z').getTime()

describe('Clear activity + undo window', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /**
   * Seed `count` entries directly into storage, newest first ("Seeded entry 0"
   * is the newest). Descriptions are deliberately unlike the existing suite's
   * bare getByText('settings') / getByText('just now') queries.
   */
  function seedActivities(count: number): Activity[] {
    const entries: Activity[] = []

    for (let index = 0; index < count; index += 1) {
      entries.push({
        id: `seeded-${index}`,
        type: 'settings',
        description: `Seeded entry ${index}.`,
        timestamp: BASE_TIME - index * 1000,
      })
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    return entries
  }

  /** The Activity section, for scoping queries that could otherwise be ambiguous. */
  function getSection(): HTMLElement {
    return screen.getByRole('region', { name: 'Recent Activity' })
  }

  function getClearButton(): HTMLElement | null {
    return within(getSection()).queryByRole('button', { name: 'Clear activity' })
  }

  function getUndoButton(): HTMLElement | null {
    return within(getSection()).queryByRole('button', { name: 'Undo' })
  }

  function getVisibleDescriptions(): (string | null | undefined)[] {
    return within(getSection())
      .queryAllByRole('listitem')
      .map((item) => item.querySelector('.activity-feed__description')?.textContent)
  }

  function useFrozenFakeTimers() {
    vi.useFakeTimers()
    vi.setSystemTime(BASE_TIME)
  }

  // --- R1 clear control ------------------------------------------------

  it('shows Clear activity only when entries are stored', () => {
    seedActivities(3)
    const { unmount } = render(<ActivityFeed />)

    expect(within(getSection()).getByRole('button', { name: 'Clear activity' })).toBeInTheDocument()

    unmount()
    localStorage.clear()
    render(<ActivityFeed />)

    expect(getClearButton()).toBeNull()
    expect(
      screen.getByText('No recent activity yet. Actions you take will show up here.'),
    ).toBeInTheDocument()
  })

  it('Clear removes all stored entries not just the visible 20', () => {
    useFrozenFakeTimers()
    // 25 stored entries; only 20 are ever visible.
    seedActivities(25)
    render(<ActivityFeed />)

    expect(within(getSection()).getAllByRole('listitem')).toHaveLength(20)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))

    // Every stored entry is gone, not only the 20 that were rendered.
    expect(getActivities()).toEqual([])
    expect(document.querySelector('li')).toBeNull()
    expect(within(getSection()).queryAllByRole('listitem')).toHaveLength(0)
  })

  // --- R2 undo window --------------------------------------------------

  it('Clear shows Undo and status, Undo restores exact entries in order', () => {
    useFrozenFakeTimers()
    seedActivities(3)
    render(<ActivityFeed />)

    const before = getVisibleDescriptions()
    expect(before).toEqual(['Seeded entry 0.', 'Seeded entry 1.', 'Seeded entry 2.'])

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))

    expect(getUndoButton()).toBeInTheDocument()
    expect(within(getSection()).getByRole('status')).toHaveTextContent('Activity cleared.')
    expect(getVisibleDescriptions()).toEqual([])

    fireEvent.click(getUndoButton() as HTMLElement)

    // Exactly the same entries, same order, same ids and timestamps.
    expect(getVisibleDescriptions()).toEqual(before)
    expect(getActivities().map((activity) => activity.id)).toEqual([
      'seeded-0',
      'seeded-1',
      'seeded-2',
    ])
    expect(getUndoButton()).toBeNull()
  })

  it('Undo stays available at 4999ms and disappears at 5000ms', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    expect(getUndoButton()).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS - 1)
    })
    expect(getUndoButton()).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(getUndoButton()).toBeNull()
  })

  // --- R3 expiry -------------------------------------------------------

  it('expiry removes Undo and restores empty copy, snapshot unrecoverable', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS)
    })

    // No Undo affordance is offered any more, so the snapshot is unrecoverable.
    expect(getUndoButton()).toBeNull()
    expect(
      screen.getByText('No recent activity yet. Actions you take will show up here.'),
    ).toBeInTheDocument()
    expect(getActivities()).toEqual([])
    // Nothing is announced for the expiry: the status text is removed.
    expect(within(getSection()).getByRole('status').textContent).toBe('')
  })

  it('no timer callback and no console error after unmount', () => {
    useFrozenFakeTimers()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    seedActivities(2)
    const { unmount } = render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))

    // The undo window's own timeout id, identified by its UNDO_WINDOW_MS delay.
    const undoTimerIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === UNDO_WINDOW_MS)
    expect(undoTimerIndex).toBeGreaterThanOrEqual(0)
    const undoTimerId = setTimeoutSpy.mock.results[undoTimerIndex]?.value

    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    unmount()

    // The effect cleanup clears the timer it owns, so its callback can never
    // fire after unmount. (vi.getTimerCount() cannot be used here: React and
    // jsdom internals leave timers pending regardless of this component.)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(undoTimerId)

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS * 2)
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  // --- R4 reload semantics ---------------------------------------------

  it('reload inside window shows empty feed with no Undo', () => {
    useFrozenFakeTimers()
    seedActivities(3)
    const { unmount } = render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    expect(getUndoButton()).toBeInTheDocument()

    // Reload while still inside the window: unmount plus a fresh render, which
    // is faithful because the clear committed to localStorage at click time.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    unmount()
    render(<ActivityFeed />)

    expect(getUndoButton()).toBeNull()
    expect(getClearButton()).toBeNull()
    expect(
      screen.getByText('No recent activity yet. Actions you take will show up here.'),
    ).toBeInTheDocument()
  })

  it('reload after Undo shows restored entries', () => {
    useFrozenFakeTimers()
    seedActivities(3)
    const { unmount } = render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    fireEvent.click(getUndoButton() as HTMLElement)

    unmount()
    render(<ActivityFeed />)

    // The restore wrote the entries back, so they survive the reload.
    expect(getVisibleDescriptions()).toEqual([
      'Seeded entry 0.',
      'Seeded entry 1.',
      'Seeded entry 2.',
    ])
    expect(within(getSection()).getByRole('button', { name: 'Clear activity' })).toBeInTheDocument()
  })

  // --- R5 no self-logging ----------------------------------------------

  it('clear and undo write no activity entry', () => {
    useFrozenFakeTimers()
    seedActivities(3)
    render(<ActivityFeed />)

    expect(getActivities()).toHaveLength(3)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    // A "Cleared activity" self-log would immediately repopulate the feed.
    expect(getActivities()).toHaveLength(0)

    fireEvent.click(getUndoButton() as HTMLElement)
    // Exactly the three restored entries; no extra entry for the undo itself.
    expect(getActivities()).toHaveLength(3)
    expect(getActivities().map((activity) => activity.description)).toEqual([
      'Seeded entry 0.',
      'Seeded entry 1.',
      'Seeded entry 2.',
    ])
  })

  it('entry added during window appears and re-enables Clear', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    expect(getClearButton()).toBeNull()

    act(() => {
      addActivity('settings', 'Added during the window.')
    })

    expect(screen.getByText('Added during the window.')).toBeInTheDocument()
    // At least one entry is stored again, so Clear is available...
    expect(getClearButton()).toBeInTheDocument()
    // ...and the window is untouched, so Undo is still offered.
    expect(getUndoButton()).toBeInTheDocument()
  })

  it('second Clear merges snapshot and restarts window, Undo restores both', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))

    act(() => {
      addActivity('settings', 'Added between clears.')
    })

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    // Second clear at t=3000 merges into the existing snapshot and restarts.
    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))

    // t=6000 from the first clear: without a restart the window would already
    // have expired, so Undo still being present proves the restart.
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(getUndoButton()).toBeInTheDocument()

    fireEvent.click(getUndoButton() as HTMLElement)

    // Everything cleared across both clears comes back.
    expect(getActivities().map((activity) => activity.description).sort()).toEqual([
      'Added between clears.',
      'Seeded entry 0.',
      'Seeded entry 1.',
    ])
    expect(getVisibleDescriptions()).toEqual([
      'Added between clears.',
      'Seeded entry 0.',
      'Seeded entry 1.',
    ])
  })

  // --- R6 keyboard -----------------------------------------------------
  //
  // jsdom does not synthesize a click from a keydown on a native button, so
  // each keyboard case fires the key event and then the click a real browser
  // would produce. The point under test is the focus handoff, which is what
  // the assertions cover.

  it('Enter activates Clear and focus moves to Undo', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    const clearButton = within(getSection()).getByRole('button', { name: 'Clear activity' })
    clearButton.focus()
    expect(clearButton).toHaveFocus()

    fireEvent.keyDown(clearButton, { key: 'Enter', code: 'Enter' })
    fireEvent.click(clearButton)

    expect(getUndoButton()).toHaveFocus()
  })

  it('Space activates Clear and focus moves to Undo', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    const clearButton = within(getSection()).getByRole('button', { name: 'Clear activity' })
    clearButton.focus()

    fireEvent.keyDown(clearButton, { key: ' ', code: 'Space' })
    fireEvent.keyUp(clearButton, { key: ' ', code: 'Space' })
    fireEvent.click(clearButton)

    expect(getUndoButton()).toHaveFocus()
  })

  it('Undo activation moves focus to Clear', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    const clearButton = within(getSection()).getByRole('button', { name: 'Clear activity' })
    clearButton.focus()
    fireEvent.keyDown(clearButton, { key: 'Enter', code: 'Enter' })
    fireEvent.click(clearButton)

    const undoButton = getUndoButton() as HTMLElement
    expect(undoButton).toHaveFocus()

    fireEvent.keyDown(undoButton, { key: 'Enter', code: 'Enter' })
    fireEvent.click(undoButton)

    // The Clear button reappeared because entries exist again.
    expect(getClearButton()).toHaveFocus()
  })

  it('expiry while Undo focused moves focus to heading', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    expect(getUndoButton()).toHaveFocus()

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS)
    })

    // Focus lands on the heading rather than being dropped to document.body.
    const heading = screen.getByRole('heading', { name: 'Recent Activity', level: 2 })
    expect(heading).toHaveFocus()
    expect(document.body).not.toHaveFocus()
  })

  // --- R7 screen readers -----------------------------------------------

  it('status region announces cleared then restored and is not a list', () => {
    useFrozenFakeTimers()
    seedActivities(2)
    render(<ActivityFeed />)

    const status = within(getSection()).getByRole('status')

    // A single status element, implicitly polite, and not a list construct.
    expect(status.tagName).toBe('P')
    expect(status.closest('ul')).toBeNull()
    expect(status.closest('li')).toBeNull()
    expect(status).not.toHaveAttribute('role', 'list')
    expect(within(getSection()).getAllByRole('status')).toHaveLength(1)
    expect(status.textContent).toBe('')

    // The existing aria-live on the feed list is unchanged.
    expect(within(getSection()).getByRole('list')).toHaveAttribute('aria-live', 'polite')

    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    expect(within(getSection()).getByRole('status')).toHaveTextContent('Activity cleared.')

    fireEvent.click(getUndoButton() as HTMLElement)
    expect(within(getSection()).getByRole('status')).toHaveTextContent('Activity restored.')
    // Still exactly one status element, and the list keeps its aria-live.
    expect(within(getSection()).getAllByRole('status')).toHaveLength(1)
    expect(within(getSection()).getByRole('list')).toHaveAttribute('aria-live', 'polite')

    // Nothing new is announced on expiry: clear again, let it lapse, and the
    // status text is removed rather than replaced.
    fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS)
    })
    expect(within(getSection()).getByRole('status').textContent).toBe('')
  })

  // --- R8 storage failure ----------------------------------------------

  it('Clear empties the list in memory even when setItem throws', () => {
    useFrozenFakeTimers()
    seedActivities(3)
    render(<ActivityFeed />)

    // Install the failure only after seeding, so the entries are on screen.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => {
      fireEvent.click(within(getSection()).getByRole('button', { name: 'Clear activity' }))
    }).not.toThrow()

    // The in-memory list still empties for this session even though the write
    // failed and the pub/sub re-read would otherwise resurface the entries.
    expect(within(getSection()).queryAllByRole('listitem')).toHaveLength(0)
    expect(document.querySelector('li')).toBeNull()
    // The Undo affordance and the status still show, and no error UI appears.
    expect(getUndoButton()).toBeInTheDocument()
    expect(within(getSection()).getByRole('status')).toHaveTextContent('Activity cleared.')
    expect(screen.queryByText(/error/i)).toBeNull()

    setItemSpy.mockRestore()
    // Persistence degraded, so storage still holds the entries. That is the
    // accepted R8 behavior: no throw, no error UI, no console output.
    expect(getActivities()).toHaveLength(3)
  })
})
