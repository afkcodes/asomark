import { CheckCircle2, XCircle, Clock, Zap, AlertTriangle, Info } from 'lucide-react'
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

export function ActionCard({ action, onApprove, onReject }: ActionCardProps) {
  const auth = authorityConfig[action.authorityLevel as keyof typeof authorityConfig] ?? authorityConfig.L1
  const AuthIcon = auth.icon
  const isPending = action.status === 'pending'

  return (
    <div
      className={cn(
        'p-4 bg-surface-2 border border-border rounded-[var(--radius-lg)]',
        'transition-all duration-200',
        isPending && 'border-l-2 border-l-accent',
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AuthIcon size={14} className="text-text-tertiary" />
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {action.actionType.replace(/_/g, ' ')}
          </span>
          <Badge variant={auth.color}>{auth.label}</Badge>
        </div>
        <StatusBadge status={action.status} />
      </div>

      <p className="text-sm text-text-secondary mb-2 leading-relaxed">{action.reasoning}</p>

      {action.suggestedChange && (
        <div className="bg-surface-1 border border-border rounded-[var(--radius-sm)] p-3 mb-3">
          <p className="text-xs text-text-tertiary mb-1 font-medium">Suggested Change</p>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{action.suggestedChange}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted">
          {formatDate(action.createdAt, true)}
        </span>

        {isPending && (onApprove || onReject) && (
          <div className="flex gap-2">
            {onReject && (
              <Button variant="ghost" size="sm" onClick={onReject}>
                <XCircle size={13} />
                Reject
              </Button>
            )}
            {onApprove && (
              <Button size="sm" onClick={onApprove}>
                <CheckCircle2 size={13} />
                Approve
              </Button>
            )}
          </div>
        )}
      </div>
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
    <Badge variant={c.variant}>
      <c.icon size={10} className="mr-1" />
      {c.label}
    </Badge>
  )
}
