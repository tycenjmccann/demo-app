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

/**
 * Monotonic suffix so two entries created within the same millisecond still get
 * distinct ids. Zero padded so plain string comparison matches numeric order.
 */
let sequence = 0

function nextId(timestamp: number): string {
  const suffix = String(sequence++).padStart(6, '0')
  return `${timestamp}-${suffix}`
}

function isActivityItem(value: unknown): value is ActivityItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<ActivityItem>
  return (
    typeof item.id === 'string' &&
    typeof item.type === 'string' &&
    typeof item.description === 'string' &&
    typeof item.timestamp === 'number' &&
    Number.isFinite(item.timestamp)
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
