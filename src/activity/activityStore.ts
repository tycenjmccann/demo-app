// Unified persistence + pub/sub store for the Recent Activity feed.
//
// This file reconciles two independent implementations that both landed at
// src/activity* against the same localStorage key "demo.activity":
//   - TEAM-3628 (main): sort-based newest-first ordering, id de-duplication,
//     crypto.randomUUID ids, addActivity returns the created entry.
//   - TEAM-3630 (branch): TEAM-3658 hardening that rejects timestamps outside
//     the valid ECMAScript Date range, corrupt-storage resilience, and
//     StrictMode-safe idempotent subscribe/unsubscribe.
//
// STORAGE FORMAT: localStorage key "demo.activity" holds a JSON array of
// activity objects. getActivities() always returns entries NEWEST-FIRST,
// derived via a stable sort by timestamp descending. Equal timestamps keep
// their stored order.

export type Activity = {
  id: string
  type: string
  description: string
  timestamp: number // epoch milliseconds
}

// Backwards-compatible alias for the TEAM-3630 lineage, which referred to the
// same shape as `ActivityEntry`.
export type ActivityEntry = Activity

type ActivityListener = () => void

const STORAGE_KEY = 'demo.activity'
const MAX_STORED_ACTIVITIES = 100

// Maximum absolute epoch-ms value representable as a valid ECMAScript Date.
// Finite numbers beyond this pass Number.isFinite but are an "Invalid Date";
// new Date(ts).toISOString() would throw a RangeError at render time. Bounding
// here keeps the store's contract consistent with what the render layer
// assumes (TEAM-3658 hardening).
const MAX_VALID_DATE_TIMESTAMP = 8.64e15

// Module-level subscriber registry. Using a Set guarantees each listener is
// registered at most once, which keeps subscribe/unsubscribe idempotent and
// safe under React StrictMode's double-invoked effects in development.
const listeners = new Set<ActivityListener>()

let fallbackIdCounter = 0

function isValidDateTimestamp(timestamp: number): boolean {
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= MAX_VALID_DATE_TIMESTAMP
}

function isActivity(value: unknown): value is Activity {
  if (!value || typeof value !== 'object') {
    return false
  }

  const activity = value as Partial<Activity>

  return (
    typeof activity.id === 'string' &&
    typeof activity.type === 'string' &&
    typeof activity.description === 'string' &&
    typeof activity.timestamp === 'number' &&
    isValidDateTimestamp(activity.timestamp)
  )
}

/**
 * Validate, de-duplicate (by id, keeping first occurrence), sort newest-first
 * (stable, so equal timestamps keep stored order), and cap to MAX_STORED_ACTIVITIES.
 * Individual malformed entries are skipped defensively.
 */
function sanitizeActivities(values: unknown[]): Activity[] {
  const seenIds = new Set<string>()

  return values
    .filter(isActivity)
    .filter((activity) => {
      if (seenIds.has(activity.id)) {
        return false
      }

      seenIds.add(activity.id)
      return true
    })
    .sort((leftActivity, rightActivity) => rightActivity.timestamp - leftActivity.timestamp)
    .slice(0, MAX_STORED_ACTIVITIES)
}

/**
 * Read + validate the persisted array. Fails soft to [] on any problem:
 * missing key, malformed JSON, valid JSON that is not an array, or
 * localStorage throwing (unavailable / access denied).
 */
function readStoredActivities(): Activity[] {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY)

    if (!storedValue) {
      return []
    }

    const parsedValue: unknown = JSON.parse(storedValue)

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return sanitizeActivities(parsedValue)
  } catch {
    return []
  }
}

/**
 * Persist the array (already newest-first). Fails soft: any error
 * (e.g. quota exceeded, storage unavailable) is swallowed so an exception
 * never reaches React render.
 */
function writeStoredActivities(activities: Activity[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities))
  } catch {
    return
  }
}

function createActivityId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    fallbackIdCounter += 1
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${fallbackIdCounter}`
  }
}

function notifySubscribers(): void {
  // Snapshot to avoid mutation-during-iteration issues if a listener
  // unsubscribes itself synchronously; also isolate a misbehaving listener so
  // it cannot break the notification loop.
  for (const listener of Array.from(listeners)) {
    try {
      listener()
    } catch {
      // A misbehaving listener must not break the notification loop.
    }
  }
}

/**
 * Prepend a new activity entry (newest-first), enforce the 100-entry cap by
 * dropping the oldest, persist, then notify subscribers. Returns the created
 * entry. Fails soft on persistence errors.
 */
export function addActivity(type: string, description: string): Activity {
  const activity: Activity = {
    id: createActivityId(),
    type,
    description,
    timestamp: Date.now(),
  }
  const activities = [activity, ...readStoredActivities()].slice(0, MAX_STORED_ACTIVITIES)

  writeStoredActivities(activities)
  notifySubscribers()

  return activity
}

/**
 * Single read source for the component. Returns entries NEWEST-FIRST.
 */
export function getActivities(): Activity[] {
  return readStoredActivities()
}

/**
 * Subscribe to store changes. Returns an unsubscribe function that is
 * idempotent (calling it more than once, or after the listener was already
 * removed, is a no-op). This keeps things safe under React StrictMode.
 *
 * A native `storage` event does NOT fire in the tab that performed the write,
 * so this pub/sub is required for same-tab live updates.
 */
export function subscribe(listener: ActivityListener): () => void {
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
