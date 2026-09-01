export type Activity = {
  id: string
  type: string
  description: string
  timestamp: number
}

type ActivityListener = () => void

const STORAGE_KEY = 'demo.activity'
const MAX_STORED_ACTIVITIES = 100
const listeners = new Set<ActivityListener>()
let fallbackIdCounter = 0

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
    Number.isFinite(activity.timestamp)
  )
}

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

    return parsedValue.filter(isActivity).slice(0, MAX_STORED_ACTIVITIES)
  } catch {
    return []
  }
}

function writeStoredActivities(activities: Activity[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities))
  } catch {
    return
  }
}

function createActivityId() {
  try {
    return crypto.randomUUID()
  } catch {
    fallbackIdCounter += 1
    return `${Date.now()}-${fallbackIdCounter}`
  }
}

function notifySubscribers() {
  listeners.forEach((listener) => {
    listener()
  })
}

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

export function getActivities(): Activity[] {
  return readStoredActivities()
}

export function subscribe(listener: ActivityListener) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
