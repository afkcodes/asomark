import { cn } from '#/lib/utils'

export function RankDeltaBadge({
  current,
  previous,
}: {
  current: number | null
  previous?: number | null
}) {
  if (current == null) {
    return <span className="text-[11px] text-text-muted">—</span>
  }

  const delta = previous != null ? previous - current : null
  const improving = delta != null && delta > 0
  const declining = delta != null && delta < 0

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold text-text-primary tabular-nums">
        #{current}
      </span>
      {delta != null && delta !== 0 && (
        <span
          className={cn(
            'text-[10px] font-semibold tabular-nums',
            improving && 'text-emerald',
            declining && 'text-rose',
          )}
        >
          {improving ? `+${delta}` : delta}
        </span>
      )}
    </div>
  )
}
