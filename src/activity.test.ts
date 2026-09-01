import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ENTRIES,
  STORAGE_KEY,
  addActivity,
  getActivities,
  relativeTime,
  subscribe,
  type ActivityItem,
} from './activity'

function readRaw(): ActivityItem[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ActivityItem[]
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('addActivity', () => {
  it('writes a well-formed entry to localStorage', () => {
    const before = Date.now()
    addActivity('settings', 'Changed the theme to dark')
    const stored = readRaw()

    expect(stored).toHaveLength(1)
    const [entry] = stored
    expect(typeof entry.id).toBe('string')
    expect(entry.id.length).toBeGreaterThan(0)
    expect(entry.type).toBe('settings')
    expect(entry.description).toBe('Changed the theme to dark')
    expect(typeof entry.timestamp).toBe('number')
    expect(entry.timestamp).toBeGreaterThanOrEqual(before)
    expect(Object.keys(entry).sort()).toEqual(['description', 'id', 'timestamp', 'type'])
  })

  it('mints unique ids for two adds within the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    addActivity('a', 'first')
    addActivity('a', 'second')

    const ids = readRaw().map(entry => entry.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('caps storage at 100 entries, dropping the oldest', () => {
    let clock = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock++)

    const added: ActivityItem[] = []
    for (let i = 0; i < MAX_ENTRIES + 1; i++) {
      added.push(addActivity('bulk', `entry ${i}`))
    }

    // The 100th add must still leave exactly 100 entries (no premature trim).
    const stored = readRaw()
    expect(stored).toHaveLength(MAX_ENTRIES)

    const storedIds = new Set(stored.map(entry => entry.id))
    expect(storedIds.has(added[0].id)).toBe(false)
    for (const entry of added.slice(1)) {
      expect(storedIds.has(entry.id)).toBe(true)
    }
    expect(stored.some(entry => entry.description === 'entry 0')).toBe(false)
    expect(stored.some(entry => entry.description === 'entry 1')).toBe(true)
    expect(stored.some(entry => entry.description === `entry ${MAX_ENTRIES}`)).toBe(true)
  })

  it('holds exactly 100 entries after the 100th add and after the 101st', () => {
    let clock = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => clock++)

    for (let i = 0; i < MAX_ENTRIES; i++) addActivity('bulk', `entry ${i}`)
    expect(readRaw()).toHaveLength(MAX_ENTRIES)

    addActivity('bulk', 'one too many')
    expect(readRaw()).toHaveLength(MAX_ENTRIES)
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    addActivity('a', 'one')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    addActivity('a', 'two')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('fails soft when localStorage throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => addActivity('a', 'one')).not.toThrow()
  })

  it('fails soft when localStorage throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => addActivity('a', 'one')).not.toThrow()
    expect(getActivities()).toEqual([])
  })
})

describe('getActivities', () => {
  it('returns entries newest first', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'b', type: 'a', description: 'middle', timestamp: 2000 },
        { id: 'a', type: 'a', description: 'oldest', timestamp: 1000 },
        { id: 'c', type: 'a', description: 'newest', timestamp: 3000 },
      ]),
    )

    expect(getActivities().map(entry => entry.description)).toEqual([
      'newest',
      'middle',
      'oldest',
    ])
  })

  it('breaks timestamp ties by id, descending', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1700000000000-000001', type: 'a', description: 'second', timestamp: 1000 },
        { id: '1700000000000-000002', type: 'a', description: 'third', timestamp: 1000 },
        { id: '1700000000000-000000', type: 'a', description: 'first', timestamp: 1000 },
      ]),
    )

    expect(getActivities().map(entry => entry.description)).toEqual([
      'third',
      'second',
      'first',
    ])
  })

  it('returns newest-first after addActivity, including same-millisecond adds', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    addActivity('a', 'first')
    addActivity('a', 'second')
    addActivity('a', 'third')

    expect(getActivities().map(entry => entry.description)).toEqual([
      'third',
      'second',
      'first',
    ])
  })

  it('returns [] when nothing is stored', () => {
    expect(getActivities()).toEqual([])
  })

  it('returns [] for an empty string', () => {
    localStorage.setItem(STORAGE_KEY, '')
    expect(getActivities()).toEqual([])
  })

  it('returns [] for invalid JSON without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json at all')
    expect(() => getActivities()).not.toThrow()
    expect(getActivities()).toEqual([])
  })

  it('returns [] for a non-array payload', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'a' }))
    expect(getActivities()).toEqual([])

    localStorage.setItem(STORAGE_KEY, JSON.stringify('nope'))
    expect(getActivities()).toEqual([])

    localStorage.setItem(STORAGE_KEY, JSON.stringify(null))
    expect(getActivities()).toEqual([])
  })

  it('filters out malformed members and keeps the valid ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        null,
        'string entry',
        42,
        { id: 'x' },
        { id: 1, type: 'a', description: 'numeric id', timestamp: 1 },
        { id: 'y', type: 'a', description: 'string timestamp', timestamp: '123' },
        { id: 'z', type: 'a', description: 'nan timestamp', timestamp: Number.NaN },
        { id: 'ok', type: 'a', description: 'valid', timestamp: 5000 },
      ]),
    )

    expect(() => getActivities()).not.toThrow()
    expect(getActivities()).toEqual([
      { id: 'ok', type: 'a', description: 'valid', timestamp: 5000 },
    ])
  })
})

describe('relativeTime', () => {
  const now = 1_700_000_000_000
  const ago = (ms: number) => relativeTime(now - ms, now)

  it('reports "just now" under a minute', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(1_000)).toBe('just now')
    expect(ago(59_000)).toBe('just now')
    expect(ago(59_999)).toBe('just now')
  })

  it('rolls exactly 60s into the minutes tier', () => {
    expect(ago(60_000)).toBe('1m ago')
  })

  it('reports minutes up to the hour boundary', () => {
    expect(ago(120_000)).toBe('2m ago')
    expect(ago(59 * 60_000 + 59_000)).toBe('59m ago')
    expect(ago(3_599_999)).toBe('59m ago')
  })

  it('rolls exactly 3600s into the hours tier', () => {
    expect(ago(3_600_000)).toBe('1h ago')
  })

  it('reports hours up to the day boundary', () => {
    expect(ago(2 * 3_600_000)).toBe('2h ago')
    expect(ago(23 * 3_600_000 + 59 * 60_000)).toBe('23h ago')
    expect(ago(86_399_999)).toBe('23h ago')
  })

  it('rolls exactly 86400s into the days tier', () => {
    expect(ago(86_400_000)).toBe('1d ago')
  })

  it('reports multi-day ages', () => {
    expect(ago(3 * 86_400_000)).toBe('3d ago')
    expect(ago(45 * 86_400_000 + 3_600_000)).toBe('45d ago')
  })

  it('treats future timestamps as "just now"', () => {
    expect(relativeTime(now + 1_000, now)).toBe('just now')
    expect(relativeTime(now + 10 * 86_400_000, now)).toBe('just now')
  })
})
