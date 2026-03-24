import { type ReactNode } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from './button'
import { Spinner } from './spinner'
import { cn } from '#/lib/utils'

interface ActionButtonProps {
  onClick: () => void
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  icon: ReactNode
  label: string
  pendingLabel?: string
  successMessage?: string
  errorMessage?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
}

export function ActionButton({
  onClick,
  isPending,
  isSuccess,
  isError,
  icon,
  label,
  pendingLabel,
  successMessage,
  errorMessage,
  variant = 'secondary',
  size = 'sm',
  disabled,
  className,
}: ActionButtonProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={disabled || isPending}
        className={cn(
          isPending && 'opacity-80',
          className,
        )}
      >
        {isPending ? (
          <Spinner size={13} className="text-current" />
        ) : isSuccess ? (
          <CheckCircle2 size={13} className="text-emerald" />
        ) : (
          icon
        )}
        {isPending ? (pendingLabel ?? label) : label}
      </Button>

      {/* Inline status feedback */}
      {isPending && (
        <span className="text-xs text-text-tertiary animate-pulse">
          Working...
        </span>
      )}
      {isSuccess && successMessage && (
        <span className="text-xs text-emerald animate-fade-in">
          {successMessage}
        </span>
      )}
      {isError && (
        <span className="text-xs text-rose animate-fade-in flex items-center gap-1">
          <AlertCircle size={11} />
          {errorMessage ?? 'Something went wrong'}
        </span>
      )}
    </div>
  )
}
