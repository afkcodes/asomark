import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '#/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full bg-surface-1 border border-border rounded-[var(--radius-md)]',
        'px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
        'transition-colors duration-150',
        'hover:border-border-hover focus:border-accent focus:outline-none',
        'focus:ring-1 focus:ring-accent/30',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
