import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addActivity, getActivities, subscribe } from './activityStore'

// Unified store test suite. Combines the TEAM-3628 (main) and TEAM-3630
// (branch) lineages against the reconciled store. Where the branch tests
// asserted a localStorage layout that differed from the unified API, the
// assertions were adapted to the unified newest-first storage order while
// preserving the behavior under test (100-cap, which entries survive,
// corrupt-storage resilience, TEAM-3658 out-of-range rejection, pub/sub).

const STORAGE_KEY = 'demo.activity'

describe('activity store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  // --- main (TEAM-3628) lineage ---------------------------------------

  it('adds entries with required fields and persists under demo.activity', () => {
    const activity = addActivity('settings', 'Updated notification preferences.')
    const storedActivities = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')

    expect(activity.id).toEqual(expect.any(String))
    expect(activity.type).toBe('settings')
    expect(activity.description).toBe('Updated notification preferences.')
    expect(activity.timestamp).toEqual(expect.any(Number))
    expect(storedActivities).toEqual([activity])
    expect(getActivities()).toEqual([activity])
  })

  it('returns newest activities first while preserving prepend order for equal timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const firstActivity = addActivity('settings', 'First update.')
    const secondActivity = addActivity('settings', 'Second update.')
    const thirdActivity = addActivity('settings', 'Third update.')

    expect(getActivities().map((activity) => activity.id)).toEqual([
      thirdActivity.id,
      secondActivity.id,
      firstActivity.id,
    ])
  })

  it('sorts valid stored activities newest-first', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'oldest', type: 'settings', description: 'Oldest activity.', timestamp: 1 },
        { id: 'newest', type: 'settings', description: 'Newest activity.', timestamp: 3 },
        { id: 'middle', type: 'settings', description: 'Middle activity.', timestamp: 2 },
      ]),
    )

    expect(getActivities().map((activity) => activity.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('preserves stored order for activities with equal timestamps', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'first', type: 'settings', description: 'First activity.', timestamp: 1 },
        { id: 'second', type: 'settings', description: 'Second activity.', timestamp: 1 },
        { id: 'third', type: 'settings', description: 'Third activity.', timestamp: 1 },
      ]),
    )

    expect(getActivities().map((activity) => activity.id)).toEqual(['first', 'second', 'third'])
  })

  it('caps storage at 100 entries and drops the oldest on the 101st add', () => {
    for (let index = 0; index < 100; index += 1) {
      addActivity('settings', `Activity ${index}`)
    }

    expect(getActivities()).toHaveLength(100)
    expect(getActivities().some((activity) => activity.description === 'Activity 0')).toBe(true)

    addActivity('settings', 'Activity 100')
    const activities = getActivities()

    expect(activities).toHaveLength(100)
    expect(activities[0]?.description).toBe('Activity 100')
    expect(activities.some((activity) => activity.description === 'Activity 0')).toBe(false)
  })

  it('does not crash and returns an empty list for corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')

    expect(() => getActivities()).not.toThrow()
    expect(getActivities()).toEqual([])
  })

  it('does not crash and returns an empty list for non-array JSON', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 'activity-1' }))

    expect(() => getActivities()).not.toThrow()
    expect(getActivities()).toEqual([])
  })

  it('returns an empty list for string and number JSON values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('hello'))
    expect(getActivities()).toEqual([])

    localStorage.setItem(STORAGE_KEY, JSON.stringify(42))
    expect(getActivities()).toEqual([])
  })

  it('sanitizes entries with the wrong shape', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        null,
        { id: 'activity-1', type: 'settings', description: 'Valid activity.', timestamp: 1 },
        { id: 'activity-2', type: 'settings', timestamp: 2 },
      ]),
    )

    expect(getActivities()).toEqual([
      { id: 'activity-1', type: 'settings', description: 'Valid activity.', timestamp: 1 },
    ])
  })

  it('drops timestamps outside the valid Date range', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'too-large', type: 'settings', description: 'Too large.', timestamp: 1e300 },
        { id: 'valid', type: 'settings', description: 'Valid activity.', timestamp: 1 },
      ]),
    )

    expect(getActivities()).toEqual([
      { id: 'valid', type: 'settings', description: 'Valid activity.', timestamp: 1 },
    ])
  })

  it('de-duplicates stored activities by id and keeps the first occurrence', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'duplicate', type: 'settings', description: 'First duplicate.', timestamp: 1 },
        { id: 'duplicate', type: 'settings', description: 'Second duplicate.', timestamp: 3 },
        { id: 'unique', type: 'settings', description: 'Unique activity.', timestamp: 2 },
      ]),
    )

    expect(getActivities()).toEqual([
      { id: 'unique', type: 'settings', description: 'Unique activity.', timestamp: 2 },
      { id: 'duplicate', type: 'settings', description: 'First duplicate.', timestamp: 1 },
    ])
  })

  it('notifies subscribers on add and supports unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    addActivity('settings', 'First update.')
    unsubscribe()
    addActivity('settings', 'Second update.')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  // --- branch (TEAM-3630) lineage -------------------------------------

  it('addActivity persists a retrievable entry under demo.activity', () => {
    addActivity('login', 'User signed in')

    const activities = getActivities()
    expect(activities).toHaveLength(1)
    expect(activities[0].type).toBe('login')
    expect(activities[0].description).toBe('User signed in')
    expect(typeof activities[0].id).toBe('string')
    expect(typeof activities[0].timestamp).toBe('number')

    const rawText = localStorage.getItem(STORAGE_KEY)
    expect(rawText).not.toBeNull()
    const stored = JSON.parse(rawText as string)
    expect(Array.isArray(stored)).toBe(true)
    expect(stored).toHaveLength(1)
    expect(stored[0].type).toBe('login')
  })

  it('caps at 100 entries, dropping the oldest (newest-first)', () => {
    // Distinct, increasing timestamps so ordering is unambiguous under the
    // unified sort-based, newest-first storage.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    for (let i = 0; i < 101; i += 1) {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + i * 1000)
      addActivity('event', `desc ${i}`)
    }

    const activities = getActivities()
    expect(activities).toHaveLength(100)

    // Newest-first: the most recent is "desc 100".
    expect(activities[0].description).toBe('desc 100')
    // The oldest ("desc 0") was dropped; oldest remaining is "desc 1".
    expect(activities[activities.length - 1].description).toBe('desc 1')

    // Unified storage is newest-first, capped at 100.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    expect(stored).toHaveLength(100)
    expect(stored[0].description).toBe('desc 100')
    expect(stored[stored.length - 1].description).toBe('desc 1')
  })

  it('getActivities returns entries newest-first', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    addActivity('a', 'first')
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    addActivity('b', 'second')
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'))
    addActivity('c', 'third')

    const activities = getActivities()
    expect(activities.map((a) => a.description)).toEqual(['third', 'second', 'first'])
  })

  it('recovers to [] on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{ not valid json')
    expect(getActivities()).toEqual([])
  })

  it('returns [] when stored value is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(getActivities()).toEqual([])
  })

  it('skips entries with wrong shape', () => {
    const bad = [
      { id: '1', type: 'ok', description: 'good', timestamp: 1000 },
      { id: '2', type: 'missing-fields' },
      { id: '3', type: 123, description: 'bad type', timestamp: 2000 },
      { id: '4', type: 'ok2', description: 'good2', timestamp: 3000 },
      null,
      'not an object',
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))

    const activities = getActivities()
    // Only the two valid entries survive; newest-first ordering.
    expect(activities.map((a) => a.description)).toEqual(['good2', 'good'])
  })

  it('returns [] when key is missing', () => {
    expect(getActivities()).toEqual([])
  })

  it('skips timestamps outside the valid Date range (TEAM-3658)', () => {
    // Finite numbers beyond |8.64e15| pass Number.isFinite but are an Invalid
    // Date; new Date(ts).toISOString() would throw RangeError at render time.
    const bad = [
      { id: 'a', type: 'ok', description: 'good', timestamp: 1000 },
      { id: 'b', type: 'evil', description: 'huge ts', timestamp: 9e15 },
      { id: 'c', type: 'evil', description: 'astronomical ts', timestamp: 1e300 },
      { id: 'd', type: 'evil', description: 'huge negative ts', timestamp: -9e15 },
      { id: 'e', type: 'ok', description: 'edge max', timestamp: 8.64e15 },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))

    const activities = getActivities()
    // Only the in-range entries survive; newest-first ordering. The 8.64e15
    // boundary is the max valid Date and must be kept.
    expect(activities.map((a) => a.description)).toEqual(['edge max', 'good'])
    // Every surviving timestamp must produce a valid Date.
    for (const activity of activities) {
      expect(Number.isNaN(new Date(activity.timestamp).getTime())).toBe(false)
    }
  })

  it('subscribe notifies on addActivity and unsubscribe is idempotent', () => {
    let count = 0
    const unsubscribe = subscribe(() => {
      count += 1
    })

    addActivity('x', 'one')
    expect(count).toBe(1)

    unsubscribe()
    // Idempotent: calling again must be a no-op and not throw.
    unsubscribe()

    addActivity('y', 'two')
    expect(count).toBe(1)
  })

  it('does not register duplicate listeners for the same reference', () => {
    let count = 0
    const listener = () => {
      count += 1
    }
    const unsub1 = subscribe(listener)
    const unsub2 = subscribe(listener)

    addActivity('z', 'three')
    expect(count).toBe(1)

    unsub1()
    unsub2()
  })
})
