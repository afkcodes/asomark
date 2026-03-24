import { type ReactNode } from 'react'
import { Play, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { cn } from '#/lib/utils'

export interface AgentInfo {
  id: string
  name: string
  description: string
  icon: ReactNode
  accentClass: string
}

interface AgentCardProps {
  agent: AgentInfo
  onRun: () => void
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  resultSummary?: string
  disabled?: boolean
}

export function AgentCard({
  agent,
  onRun,
  isPending,
  isSuccess,
  isError,
  resultSummary,
  disabled,
}: AgentCardProps) {
  return (
    <div
      className={cn(
        'group relative p-4 bg-surface-2 border border-border rounded-[var(--radius-lg)]',
        'transition-all duration-200',
        isPending && 'border-accent/30 bg-accent/[0.02]',
        isSuccess && 'border-emerald/30 bg-emerald/[0.02]',
        isError && 'border-rose/30 bg-rose/[0.02]',
        !isPending && !isSuccess && !isError && 'hover:border-border-hover',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
            'transition-colors duration-200',
            agent.accentClass,
          )}
        >
          {isPending ? (
            <Spinner size={16} className="text-accent" />
          ) : isSuccess ? (
            <CheckCircle2 size={16} className="text-emerald" />
          ) : isError ? (
            <AlertCircle size={16} className="text-rose" />
          ) : (
            agent.icon
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-text-primary">{agent.name}</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRun}
              disabled={disabled || isPending}
              className={cn(
                'h-7 px-2.5 text-[11px]',
                isPending && 'opacity-60',
              )}
            >
              {isPending ? (
                <>
                  <Spinner size={11} className="text-current" />
                  Running...
                </>
              ) : (
                <>
                  <Play size={11} />
                  Run
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-text-tertiary leading-relaxed">{agent.description}</p>

          {/* Result summary */}
          {isSuccess && resultSummary && (
            <p className="text-[11px] text-emerald mt-2 animate-fade-in">{resultSummary}</p>
          )}
          {isError && (
            <p className="text-[11px] text-rose mt-2 animate-fade-in">Agent failed — check logs</p>
          )}
        </div>
      </div>
    </div>
  )
}
