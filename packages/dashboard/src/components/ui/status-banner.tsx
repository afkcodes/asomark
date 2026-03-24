import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '#/lib/utils'

interface StatusBannerProps {
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  pendingMessage: string
  successMessage?: string
  errorMessage?: string
}

export function StatusBanner({
  isPending,
  isSuccess,
  isError,
  pendingMessage,
  successMessage,
  errorMessage,
}: StatusBannerProps) {
  if (!isPending && !isSuccess && !isError) return null

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] mb-4 animate-fade-in',
        isPending && 'bg-accent/5 border border-accent/20',
        isSuccess && 'bg-emerald/5 border border-emerald/20',
        isError && 'bg-rose/5 border border-rose/20',
      )}
    >
      {isPending && (
        <>
          <Loader2 size={15} className="text-accent animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">{pendingMessage}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">This may take a moment...</p>
          </div>
        </>
      )}
      {isSuccess && (
        <>
          <CheckCircle2 size={15} className="text-emerald shrink-0" />
          <p className="text-sm font-medium text-text-primary">{successMessage ?? 'Done!'}</p>
        </>
      )}
      {isError && (
        <>
          <AlertCircle size={15} className="text-rose shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              {errorMessage ?? 'Something went wrong'}
            </p>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Check the console for details or try again
            </p>
          </div>
        </>
      )}
    </div>
  )
}
