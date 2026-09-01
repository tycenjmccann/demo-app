import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addActivity, getActivities, subscribe } from './activity'

const STORAGE_KEY = 'demo.activity'

describe('activity store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

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
})
