import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format large numbers: 1234567 → "1.2M" */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

/** Rank delta badge text: +5, -3, or — */
export function formatDelta(current: number | null, previous: number | null): string {
  if (current == null || previous == null) return '—'
  const diff = previous - current // lower rank = improvement
  if (diff === 0) return '—'
  return diff > 0 ? `+${diff}` : `${diff}`
}

/** Difficulty color based on 0-100 score */
export function difficultyColor(score: number): string {
  if (score <= 25) return 'var(--color-diff-easy)'
  if (score <= 50) return 'var(--color-diff-medium)'
  if (score <= 75) return 'var(--color-diff-hard)'
  return 'var(--color-diff-extreme)'
}

/** Difficulty label */
export function difficultyLabel(score: number): string {
  if (score <= 25) return 'Easy'
  if (score <= 50) return 'Medium'
  if (score <= 75) return 'Hard'
  return 'Extreme'
}

/** Trend direction to arrow */
export function trendArrow(direction: string): string {
  switch (direction) {
    case 'rising': return '↑'
    case 'falling': return '↓'
    default: return '→'
  }
}

/** Format date: "Mar 22" or "Mar 22, 2026" */
export function formatDate(date: string | Date, includeYear = false): string {
  const d = new Date(date)
  const month = d.toLocaleString('en', { month: 'short' })
  const day = d.getDate()
  if (includeYear) return `${month} ${day}, ${d.getFullYear()}`
  return `${month} ${day}`
}
