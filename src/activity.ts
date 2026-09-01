export interface ActivityItem {
  id: string
  type: string
  description: string
  /** Epoch milliseconds. */
  timestamp: number
}

/** localStorage key holding the JSON-encoded activity array. */
export const STORAGE_KEY = 'demo.activity'

/** Maximum number of entries kept in localStorage. */
export const MAX_ENTRIES = 100

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Largest absolute epoch-ms value a `Date` can represent (ECMAScript max time value). */
const MAX_TIME_VALUE = 8.64e15

/**
 * Per-context random token, computed once at module load. Different browsing
 * contexts (tabs, reloads) that share this origin's localStorage get different
 * tokens, so same-millisecond ids minted in separate contexts never collide.
 */
const contextToken = (() => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8)
    }
  } catch {
    // Fall through to the Math.random fallback below.
  }
  return Math.random().toString(36).slice(2, 10)
})()

/**
 * Monotonic counter so two entries created within the same millisecond in this
 * context still get distinct ids. Zero padded so, within a single context,
 * plain string comparison of ids matches creation order.
 */
let sequence = 0

/**
 * Builds an id as `${timestamp}-${contextToken}-${counter}`: the timestamp
 * orders across time, the per-context token keeps ids unique across tabs and
 * reloads sharing the same store, and the zero-padded counter keeps same-context,
 * same-millisecond ids sortable in creation order under string comparison.
 */
function nextId(timestamp: number): string {
  const suffix = String(sequence++).padStart(6, '0')
  return `${timestamp}-${contextToken}-${suffix}`
}

function isActivityItem(value: unknown): value is ActivityItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<ActivityItem>
  return (
    typeof item.id === 'string' &&
    typeof item.type === 'string' &&
    typeof item.description === 'string' &&
    typeof item.timestamp === 'number' &&
    Number.isFinite(item.timestamp) &&
    // Reject values outside the representable Date range so downstream
    // `new Date(timestamp).toISOString()` never throws (FR-8).
    Math.abs(item.timestamp) <= MAX_TIME_VALUE
  )
}

/** Reads the raw stored entries, dropping anything malformed. Never throws. */
function readStored(): ActivityItem[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isActivityItem)
}

/** Newest first: timestamp descending, id descending as a stable tie-breaker. */
function newestFirst(a: ActivityItem, b: ActivityItem): number {
  if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/**
 * All persisted activity entries, newest first. Returns `[]` when storage is
 * unavailable, empty, or corrupt.
 */
export function getActivities(): ActivityItem[] {
  return readStored().sort(newestFirst)
}

type Listener = () => void

const listeners = new Set<Listener>()

/** Subscribes to same-tab activity changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/**
 * Appends an entry to the persisted feed, trimming the oldest entries so at
 * most {@link MAX_ENTRIES} remain, then notifies same-tab subscribers.
 * Storage failures are swallowed so callers never see an exception.
 */
export function addActivity(type: string, description: string): ActivityItem {
  const timestamp = Date.now()
  const entry: ActivityItem = { id: nextId(timestamp), type, description, timestamp }

  const next = [...readStored(), entry]
  if (next.length > MAX_ENTRIES) {
    // Oldest first, then keep only the newest MAX_ENTRIES.
    next.sort((a, b) => newestFirst(b, a))
    next.splice(0, next.length - MAX_ENTRIES)
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full, disabled, or unavailable: fail soft.
  }

  notify()
  return entry
}

/** Pure, human-readable age of `timestamp` relative to `now`. */
export function relativeTime(timestamp: number, now: number): string {
  const delta = now - timestamp
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`
  return `${Math.floor(delta / DAY)}d ago`
}
