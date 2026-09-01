import { beforeEach, describe, expect, it } from 'vitest'
import { addActivity, getActivities, subscribe } from './activityStore'

const STORAGE_KEY = 'demo.activity'

beforeEach(() => {
  localStorage.clear()
})

describe('activityStore', () => {
  it('addActivity appends a retrievable entry persisted to localStorage', () => {
    addActivity('login', 'User signed in')

    const activities = getActivities()
    expect(activities).toHaveLength(1)
    expect(activities[0].type).toBe('login')
    expect(activities[0].description).toBe('User signed in')
    expect(typeof activities[0].id).toBe('string')
    expect(typeof activities[0].timestamp).toBe('number')

    // Persisted under the expected key, in stored (oldest-first) order.
    const rawText = localStorage.getItem(STORAGE_KEY)
    expect(rawText).not.toBeNull()
    const stored = JSON.parse(rawText as string)
    expect(Array.isArray(stored)).toBe(true)
    expect(stored).toHaveLength(1)
    expect(stored[0].type).toBe('login')
  })

  it('caps at 100 entries, dropping the oldest', () => {
    for (let i = 0; i < 101; i += 1) {
      addActivity('event', `desc ${i}`)
    }

    const activities = getActivities()
    expect(activities).toHaveLength(100)

    // Newest-first: the most recent is "desc 100".
    expect(activities[0].description).toBe('desc 100')
    // The oldest ("desc 0") was dropped; oldest remaining is "desc 1".
    expect(activities[activities.length - 1].description).toBe('desc 1')

    // Stored order is oldest-first, capped at 100.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    expect(stored).toHaveLength(100)
    expect(stored[0].description).toBe('desc 1')
    expect(stored[stored.length - 1].description).toBe('desc 100')
  })

  it('getActivities returns entries newest-first', () => {
    addActivity('a', 'first')
    addActivity('b', 'second')
    addActivity('c', 'third')

    const activities = getActivities()
    expect(activities.map((a) => a.description)).toEqual([
      'third',
      'second',
      'first',
    ])
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
