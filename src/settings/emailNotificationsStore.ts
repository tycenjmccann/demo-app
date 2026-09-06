// Persistence for the Email notifications setting (TEAM-4138).
//
// STORAGE FORMAT: localStorage key "demo.settings.emailNotifications" holds a
// JSON object { enabled: boolean, lastChangedAt: number }. `lastChangedAt` is
// epoch milliseconds, taken from the timestamp of the Activity entry recorded
// for the same change, so the "Last changed" line and the Activity feed agree
// to the millisecond.
//
// This is a separate key from "demo.activity" so the feed's 100-entry cap and
// sanitization stay independent of the setting. Both functions fail soft in the
// same shape as readStoredActivities / writeStoredActivities: a read problem
// yields null ("nothing persisted") and a write problem is swallowed, so
// storage can never surface as a render-time exception.

export type EmailNotificationsSetting = {
  enabled: boolean
  lastChangedAt: number // epoch milliseconds
}

const STORAGE_KEY = 'demo.settings.emailNotifications'

// Maximum absolute epoch-ms value representable as a valid ECMAScript Date.
// Finite numbers beyond this pass Number.isFinite but are an "Invalid Date";
// new Date(ts).toISOString() would throw a RangeError at render time. Declared
// locally rather than imported because src/activity/activityStore.ts keeps its
// equivalent constant module-private, and the activity module is out of scope
// for this change.
const MAX_VALID_DATE_TIMESTAMP = 8.64e15

function isValidDateTimestamp(timestamp: number): boolean {
  return Number.isFinite(timestamp) && Math.abs(timestamp) <= MAX_VALID_DATE_TIMESTAMP
}

function isEmailNotificationsSetting(value: unknown): value is EmailNotificationsSetting {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const setting = value as Partial<EmailNotificationsSetting>

  return (
    typeof setting.enabled === 'boolean' &&
    typeof setting.lastChangedAt === 'number' &&
    isValidDateTimestamp(setting.lastChangedAt)
  )
}

/**
 * Read + validate the persisted setting. Returns null for the single
 * unambiguous "nothing persisted or unusable" case: missing key, malformed
 * JSON, valid JSON that is not a non-null plain object, a non-boolean
 * `enabled`, or a `lastChangedAt` that is not a finite in-range number. A
 * persisted `enabled: false` is a real value and is returned as such, never
 * collapsed to null.
 *
 * Never throws, and never returns, logs, or echoes the raw stored string, so a
 * tampered value has no path to the page or to a log sink.
 */
export function readEmailNotificationsSetting(): EmailNotificationsSetting | null {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY)

    if (!storedValue) {
      return null
    }

    const parsedValue: unknown = JSON.parse(storedValue)

    if (!isEmailNotificationsSetting(parsedValue)) {
      return null
    }

    return { enabled: parsedValue.enabled, lastChangedAt: parsedValue.lastChangedAt }
  } catch {
    return null
  }
}

/**
 * Persist the setting. Fails soft: any error (quota exceeded, storage
 * unavailable, access denied) is swallowed so the click the user just made
 * still stays reflected on screen for the rest of the session.
 */
export function writeEmailNotificationsSetting(setting: EmailNotificationsSetting): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setting))
  } catch {
    return
  }
}
