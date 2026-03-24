import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '#/lib/utils'

export function TrendIndicator({
  direction,
  value,
}: {
  direction?: string | null
  value?: number | null
}) {
  const Icon = direction === 'rising' ? TrendingUp : direction === 'falling' ? TrendingDown : Minus

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium',
        direction === 'rising' && 'text-emerald',
        direction === 'falling' && 'text-rose',
        (!direction || direction === 'stable') && 'text-text-muted',
      )}
    >
      <Icon size={12} />
      {value != null && <span className="tabular-nums">{value}</span>}
    </div>
  )
}
