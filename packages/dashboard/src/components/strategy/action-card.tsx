import { CheckCircle2, XCircle, Clock, Zap, AlertTriangle, Info, Lightbulb, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { cn, formatDate } from '#/lib/utils'
import type { StrategyAction } from '#/lib/api'

const authorityConfig = {
  L0: { label: 'Auto', color: 'muted' as const, icon: Zap },
  L1: { label: 'Notify', color: 'accent' as const, icon: Info },
  L2: { label: 'Suggest', color: 'warning' as const, icon: AlertTriangle },
  L3: { label: 'Confirm', color: 'danger' as const, icon: AlertTriangle },
}

interface ActionCardProps {
  action: StrategyAction
  onApprove?: () => void
  onReject?: () => void
}

/** Split long text into readable chunks by sentence endings */
function splitIntoPoints(text: string): string[] {
  // Split on .; or standalone . followed by uppercase or end
  return text
    .split(/[;]\s*|(?<=\.)\s+(?=[A-Z])/)
    .map((s) => s.trim().replace(/^[-•]\s*/, ''))
    .filter((s) => s.length > 10)
}

export function ActionCard({ action, onApprove, onReject }: ActionCardProps) {
  const auth = authorityConfig[action.authorityLevel as keyof typeof authorityConfig] ?? authorityConfig.L1
  const AuthIcon = auth.icon
  const isPending = action.status === 'pending'
  const [expanded, setExpanded] = useState(isPending)

  // Parse the reasoning into a summary line + detail points
  const reasoningText = action.reasoning ?? ''
  const firstSentence = reasoningText.split(/\.\s/)[0] + (reasoningText.includes('.') ? '.' : '')
  const hasMore = reasoningText.length > firstSentence.length + 20

  // Parse suggested change into actionable bullet points
  const changePoints = action.suggestedChange ? splitIntoPoints(action.suggestedChange) : []

  return (
    <div
      className={cn(
        'bg-surface-2 border border-border rounded-[var(--radius-lg)]',
        'transition-all duration-200 overflow-hidden',
        isPending && 'border-l-2 border-l-accent',
      )}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AuthIcon size={13} className="text-text-tertiary shrink-0" />
          <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
            {action.actionType.replace(/_/g, ' ')}
          </span>
          <Badge variant={auth.color} className="text-[9px]">{auth.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">{formatDate(action.createdAt, true)}</span>
          <StatusBadge status={action.status} />
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 pb-3">
        <p className="text-sm text-text-secondary leading-relaxed">{firstSentence}</p>

        {/* Expand/collapse for details */}
        {(hasMore || changePoints.length > 0) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-[11px] text-accent hover:text-accent-hover transition-colors cursor-pointer"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Less' : 'Details'}
          </button>
        )}

        {/* Expanded details */}
        {expanded && (hasMore || changePoints.length > 0) && (
          <div className="mt-3 space-y-3 animate-fade-in">
            {/* Full reasoning (if more than summary) */}
            {hasMore && (
              <p className="text-xs text-text-tertiary leading-relaxed">
                {reasoningText.slice(firstSentence.length).trim()}
              </p>
            )}

            {/* Suggested changes as bullet points */}
            {changePoints.length > 0 && (
              <div className="bg-surface-1 border border-border/50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={12} className="text-amber" />
                  <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Quick Wins</span>
                </div>
                <ul className="space-y-1.5">
                  {changePoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-xs text-text-secondary leading-relaxed">
                      <span className="text-accent shrink-0 mt-0.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {isPending && (onApprove || onReject) && (
        <div className="px-4 py-2.5 border-t border-border/50 flex justify-end gap-2">
          {onReject && (
            <Button variant="ghost" size="sm" onClick={onReject}>
              <XCircle size={12} />
              Reject
            </Button>
          )}
          {onApprove && (
            <Button size="sm" onClick={onApprove}>
              <CheckCircle2 size={12} />
              Approve
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { variant: 'warning' as const, icon: Clock, label: 'Pending' },
    approved: { variant: 'success' as const, icon: CheckCircle2, label: 'Approved' },
    rejected: { variant: 'danger' as const, icon: XCircle, label: 'Rejected' },
    executed: { variant: 'accent' as const, icon: Zap, label: 'Executed' },
  }
  const c = config[status as keyof typeof config] ?? config.pending
  return (
    <Badge variant={c.variant} className="text-[9px]">
      <c.icon size={9} className="mr-0.5" />
      {c.label}
    </Badge>
  )
}
