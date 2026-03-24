import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '#/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer',
          'disabled:opacity-40 disabled:pointer-events-none',
          // Variants
          variant === 'primary' &&
            'bg-accent text-white hover:bg-accent-hover shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]',
          variant === 'secondary' &&
            'bg-surface-3 text-text-primary border border-border hover:bg-surface-4 hover:border-border-hover',
          variant === 'ghost' &&
            'text-text-secondary hover:text-text-primary hover:bg-surface-3',
          variant === 'danger' &&
            'bg-rose/10 text-rose border border-rose/20 hover:bg-rose/20',
          // Sizes
          size === 'sm' && 'text-xs px-2.5 py-1.5 rounded-[var(--radius-sm)] gap-1.5',
          size === 'md' && 'text-sm px-3.5 py-2 rounded-[var(--radius-md)] gap-2',
          size === 'lg' && 'text-sm px-5 py-2.5 rounded-[var(--radius-md)] gap-2',
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
