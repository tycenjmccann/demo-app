import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readEmailNotificationsSetting, writeEmailNotificationsSetting } from './emailNotificationsStore'

const STORAGE_KEY = 'demo.settings.emailNotifications'

describe('emailNotificationsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // --- R1 round trip ---------------------------------------------------

  it('round-trips a written setting (enabled: true)', () => {
    const setting = { enabled: true, lastChangedAt: 1_700_000_000_000 }

    writeEmailNotificationsSetting(setting)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual(setting)
    expect(readEmailNotificationsSetting()).toEqual(setting)
  })

  it('round-trips a persisted false as a value, not null', () => {
    const setting = { enabled: false, lastChangedAt: 1_700_000_000_000 }

    writeEmailNotificationsSetting(setting)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) as string)).toEqual(setting)
    // A persisted `false` is a real value; it must not collapse to null, which
    // is reserved for "nothing persisted or unusable".
    expect(readEmailNotificationsSetting()).toEqual(setting)
    expect(readEmailNotificationsSetting()).not.toBeNull()
  })

  // --- R2 default ------------------------------------------------------

  it('returns null when nothing is persisted', () => {
    expect(readEmailNotificationsSetting()).toBeNull()
  })

  // --- R5 corrupt or tampered storage ----------------------------------

  describe('corrupt or tampered storage returns null and never throws', () => {
    it('returns null for an absent key', () => {
      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not json')

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null for JSON null', () => {
      localStorage.setItem(STORAGE_KEY, 'null')

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null for a JSON string', () => {
      localStorage.setItem(STORAGE_KEY, '"a string"')

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null for an array', () => {
      localStorage.setItem(STORAGE_KEY, '[]')

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null when enabled is not a boolean', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: 'yes', lastChangedAt: 1 }))

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null when enabled is missing', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastChangedAt: 1 }))

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null when lastChangedAt is missing', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true }))

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null when lastChangedAt is not a number', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, lastChangedAt: 'x' }))

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null when lastChangedAt is NaN (serialized as null by JSON)', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, lastChangedAt: NaN }))

      // JSON.stringify turns NaN into null, so this also covers an explicit
      // null lastChangedAt.
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{"enabled":true,"lastChangedAt":null}')
      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null for lastChangedAt above the valid Date range (8.65e15)', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, lastChangedAt: 8.65e15 }))

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('returns null for lastChangedAt below the valid Date range (-8.65e15)', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, lastChangedAt: -8.65e15 }))

      expect(() => readEmailNotificationsSetting()).not.toThrow()
      expect(readEmailNotificationsSetting()).toBeNull()
    })

    it('accepts the +8.64e15 boundary', () => {
      const setting = { enabled: true, lastChangedAt: 8.64e15 }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setting))

      expect(readEmailNotificationsSetting()).toEqual(setting)
      // The accepted boundary must still produce a valid Date.
      expect(Number.isNaN(new Date(8.64e15).getTime())).toBe(false)
    })

    it('accepts the -8.64e15 boundary', () => {
      const setting = { enabled: true, lastChangedAt: -8.64e15 }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setting))

      expect(readEmailNotificationsSetting()).toEqual(setting)
      expect(Number.isNaN(new Date(-8.64e15).getTime())).toBe(false)
    })
  })

  // --- R6 storage unavailable or write fails ---------------------------

  it('write does not throw when setItem throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => writeEmailNotificationsSetting({ enabled: true, lastChangedAt: 1 })).not.toThrow()
    expect(setItem).toHaveBeenCalled()

    setItem.mockRestore()
  })

  it('read returns null when getItem throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => readEmailNotificationsSetting()).not.toThrow()
    expect(readEmailNotificationsSetting()).toBeNull()
    expect(getItem).toHaveBeenCalled()

    getItem.mockRestore()
  })
})
