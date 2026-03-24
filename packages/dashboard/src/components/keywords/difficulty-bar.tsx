import { cn, difficultyColor, difficultyLabel } from '#/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '#/components/ui/tooltip'

/** Mini horizontal bar showing difficulty 0-100 with color gradient */
export function DifficultyBar({
  score,
  className,
}: {
  score: number
  className?: string
}) {
  const color = difficultyColor(score)
  const label = difficultyLabel(score)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('flex items-center gap-2', className)}>
          <div className="w-16 h-1.5 rounded-full bg-surface-4 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${score}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-[11px] font-medium tabular-nums" style={{ color }}>
            {score}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{label} Difficulty ({score}/100)</p>
      </TooltipContent>
    </Tooltip>
  )
}
