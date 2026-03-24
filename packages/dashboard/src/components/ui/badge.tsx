import { type HTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'muted'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full',
        variant === 'default' && 'bg-surface-4 text-text-secondary',
        variant === 'success' && 'bg-emerald-muted text-emerald',
        variant === 'warning' && 'bg-amber-muted text-amber',
        variant === 'danger' && 'bg-rose-muted text-rose',
        variant === 'accent' && 'bg-accent-muted text-accent-hover',
        variant === 'muted' && 'bg-surface-3 text-text-tertiary',
        className,
      )}
      {...props}
    />
  )
}
