// Persistence + pub/sub store for the Recent Activity feed.
//
// STORAGE FORMAT: localStorage key "demo.activity" holds a JSON array of
// ActivityEntry objects. STORED ORDER IS OLDEST-FIRST: new entries are
// appended at the END of the array. Display order (newest-first) is derived
// by reversing at read time in getActivities().

export interface ActivityEntry {
  id: string
  type: string
  description: string
  timestamp: number // epoch milliseconds
}

const STORAGE_KEY = 'demo.activity'
const MAX_ENTRIES = 100

// Maximum absolute epoch-ms value representable as a valid ECMAScript Date.
// Timestamps beyond this are "Invalid Date" and would throw from
// Date.prototype.toISOString() during render.
const MAX_TIMESTAMP = 8.64e15

// Module-level subscriber registry. Using a Set guarantees each listener is
// registered at most once, which keeps subscribe/unsubscribe idempotent and
// safe under React StrictMode's double-invoked effects in development.
const listeners = new Set<() => void>()

/**
 * Read + validate the persisted array. Fails soft to [] on any problem:
 * - missing key
 * - malformed JSON
 * - valid JSON but not an array
 * - localStorage throwing (unavailable / access denied)
 * Individual malformed entries are skipped defensively.
 * Returned array is in STORED ORDER (oldest-first).
 */
function readRaw(): ActivityEntry[] {
  let rawText: string | null
  try {
    rawText = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }

  if (rawText == null) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const result: ActivityEntry[] = []
  for (const item of parsed) {
    if (isValidEntry(item)) {
      result.push(item)
    }
  }
  return result
}

function isValidEntry(value: unknown): value is ActivityEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.type === 'string' &&
    typeof entry.description === 'string' &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp) &&
    // Reject finite numbers outside the ECMAScript Date range (|ms| > 8.64e15).
    // Such values are "Invalid Date", and new Date(ts).toISOString() throws a
    // RangeError at render time. Bounding here keeps the validation contract
    // consistent with what the ActivityFeed render assumes.
    Math.abs(entry.timestamp) <= MAX_TIMESTAMP
  )
}

/**
 * Persist the array (stored order, oldest-first). Fails soft: any error
 * (e.g. quota exceeded, storage unavailable) is swallowed so an exception
 * never reaches React render.
 */
function writeRaw(entries: ActivityEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Fail soft: ignore persistence errors.
  }
}

// Counter to help build stable unique ids for React keys.
let idCounter = 0

function makeId(timestamp: number): string {
  idCounter += 1
  return `${timestamp}-${idCounter}-${Math.random().toString(36).slice(2, 10)}`
}

function notify(): void {
  // Snapshot to avoid mutation-during-iteration issues if a listener
  // unsubscribes itself synchronously.
  for (const listener of Array.from(listeners)) {
    try {
      listener()
    } catch {
      // A misbehaving listener must not break the notification loop.
    }
  }
}

/**
 * Append a new activity entry (stored oldest-first), enforce the 100-entry
 * cap by dropping the oldest, persist, then notify subscribers.
 * Fails soft on any error.
 */
export function addActivity(type: string, description: string): void {
  try {
    const entries = readRaw()
    const entry: ActivityEntry = {
      id: makeId(Date.now()),
      type,
      description,
      timestamp: Date.now(),
    }
    entries.push(entry) // append at end => stored oldest-first
    // Cap at MAX_ENTRIES: drop oldest (front) so length never exceeds cap.
    while (entries.length > MAX_ENTRIES) {
      entries.shift()
    }
    writeRaw(entries)
  } catch {
    // Fail soft: never let addActivity throw into a caller / render path.
    return
  }
  // Notify after persisting so subscribers read fresh data.
  notify()
}

/**
 * Single read source for the component. Returns entries NEWEST-FIRST
 * for display (stored order is oldest-first, so we reverse a copy).
 */
export function getActivities(): ActivityEntry[] {
  const entries = readRaw()
  return entries.reverse()
}

/**
 * Subscribe to store changes. Returns an unsubscribe function that is
 * idempotent (calling it more than once, or after the listener was already
 * removed, is a no-op). This keeps things safe under React StrictMode.
 *
 * A native `storage` event does NOT fire in the tab that performed the write,
 * so this pub/sub is required for same-tab live updates.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  let subscribed = true
  return () => {
    if (!subscribed) {
      return
    }
    subscribed = false
    listeners.delete(listener)
  }
}
