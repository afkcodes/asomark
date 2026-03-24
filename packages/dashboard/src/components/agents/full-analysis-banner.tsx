import {
  Brain,
  CheckCircle2,
  AlertCircle,
  Search,
  Hash,
  MessageSquare,
  Activity,
  Shield,
  Palette,
  GitCompare,
  Layers,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { cn } from '#/lib/utils'

const ANALYSIS_PHASES = [
  { id: 'recon', label: 'Competitors', icon: Search },
  { id: 'review', label: 'Reviews', icon: MessageSquare },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'keyword', label: 'Keywords', icon: Hash },
  { id: 'creative', label: 'Creative', icon: Palette },
  { id: 'correlation', label: 'Correlations', icon: GitCompare },
  { id: 'cannibalization', label: 'Overlap', icon: Layers },
] as const

interface FullAnalysisBannerProps {
  onRun: () => void
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  disabled?: boolean
  summary?: string
  nextSteps?: string[]
}

export function FullAnalysisBanner({
  onRun,
  isPending,
  isSuccess,
  isError,
  disabled,
  summary,
  nextSteps,
}: FullAnalysisBannerProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-lg)] border p-5',
        'transition-all duration-300',
        isPending
          ? 'border-accent/30 bg-gradient-to-r from-accent/[0.04] to-transparent'
          : isSuccess
            ? 'border-emerald/20 bg-gradient-to-r from-emerald/[0.03] to-transparent'
            : isError
              ? 'border-rose/20 bg-gradient-to-r from-rose/[0.03] to-transparent'
              : 'border-border bg-surface-2 hover:border-border-hover',
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={cn(
            'shrink-0 w-11 h-11 rounded-xl flex items-center justify-center',
            isPending
              ? 'bg-accent/10'
              : isSuccess
                ? 'bg-emerald/10'
                : 'bg-gradient-to-br from-accent/15 to-violet-500/15',
          )}
        >
          {isPending ? (
            <Spinner size={20} className="text-accent" />
          ) : isSuccess ? (
            <CheckCircle2 size={20} className="text-emerald" />
          ) : isError ? (
            <AlertCircle size={20} className="text-rose" />
          ) : (
            <Brain size={20} className="text-accent" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {isPending
                  ? 'Running Full Analysis...'
                  : isSuccess
                    ? 'Analysis Complete'
                    : isError
                      ? 'Analysis Failed'
                      : 'Full ASO Analysis'}
              </h3>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {isPending
                  ? 'Running all agents — competitor discovery, keyword research, health scoring, creative optimization...'
                  : isSuccess
                    ? 'All agents completed. Review the strategy actions below.'
                    : isError
                      ? 'One or more agents failed. Try running individual agents for more details.'
                      : 'Run all 8 AI agents in sequence: competitors, reviews, health, risk, keywords, creative, correlations, and overlap detection'}
              </p>
            </div>
            {!isPending && (
              <Button
                size="sm"
                onClick={onRun}
                disabled={disabled || isPending}
                className="shrink-0 ml-4"
              >
                <Brain size={13} />
                {isSuccess || isError ? 'Run Again' : 'Run Analysis'}
              </Button>
            )}
          </div>

          {/* Phase indicators while running */}
          {isPending && (
            <div className="flex flex-wrap gap-2 mt-3 animate-fade-in">
              {ANALYSIS_PHASES.map((phase) => (
                <div
                  key={phase.id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-1 border border-border/50 text-[10px] text-text-tertiary"
                >
                  <phase.icon size={10} />
                  {phase.label}
                </div>
              ))}
            </div>
          )}

          {/* Results summary */}
          {isSuccess && summary && (
            <div className="mt-3 animate-fade-in">
              <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">{summary}</p>
              {nextSteps && nextSteps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {nextSteps.slice(0, 3).map((step, i) => (
                    <p key={i} className="text-[11px] text-text-tertiary flex items-start gap-1.5">
                      <span className="text-accent font-semibold shrink-0">{i + 1}.</span>
                      <span className="line-clamp-1">{step}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
