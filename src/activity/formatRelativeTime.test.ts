import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './formatRelativeTime'

const NOW = 1_000_000_000_000

function at(secondsAgo: number): number {
  return NOW - secondsAgo * 1000
}

describe('formatRelativeTime', () => {
  it('handles boundary values exactly', () => {
    expect(formatRelativeTime(at(59), NOW)).toBe('just now')
    expect(formatRelativeTime(at(60), NOW)).toBe('1m ago')
    expect(formatRelativeTime(at(3599), NOW)).toBe('59m ago')
    expect(formatRelativeTime(at(3600), NOW)).toBe('1h ago')
    expect(formatRelativeTime(at(86399), NOW)).toBe('23h ago')
    expect(formatRelativeTime(at(86400), NOW)).toBe('1d ago')
    expect(formatRelativeTime(at(604799), NOW)).toBe('6d ago')
    expect(formatRelativeTime(at(604800), NOW)).toBe('1w ago')
  })

  it('treats 0 delta as "just now"', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('just now')
  })

  it('clamps future timestamps to "just now"', () => {
    expect(formatRelativeTime(NOW + 100_000, NOW)).toBe('just now')
  })

  it('floors sub-second deltas', () => {
    // 60.9s -> floor to 60s -> 1m ago
    expect(formatRelativeTime(NOW - 60_900, NOW)).toBe('1m ago')
  })
})
