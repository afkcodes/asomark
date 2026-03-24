import { CheckCircle2, AlertCircle, Minus } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { cn } from '#/lib/utils'
import type { ListingScore } from '#/lib/api'

interface ListingScoreCardProps {
  score: ListingScore | null
  isLoading?: boolean
}

export function ListingScoreCard({ score, isLoading }: ListingScoreCardProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 bg-surface-2 rounded-lg" />
        <div className="h-16 bg-surface-2 rounded-lg" />
        <div className="h-16 bg-surface-2 rounded-lg" />
      </div>
    )
  }

  if (!score) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-text-tertiary">
          Start typing your listing to see the optimization score
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="text-center py-4">
        <div
          className={cn(
            'text-4xl font-bold tabular-nums',
            score.overall >= 70 ? 'text-emerald' : score.overall >= 40 ? 'text-amber' : 'text-rose',
          )}
        >
          {score.overall}
        </div>
        <p className="text-[10px] text-text-tertiary mt-1">ASO Score</p>
      </div>

      {/* Section scores */}
      <ScoreSection
        label="Title"
        score={score.title.score}
        detail={`${score.title.charCount}/${score.title.charLimit} chars`}
        keywords={score.title.keywordsFound}
        missing={score.title.keywordsMissing}
      />
      <ScoreSection
        label="Short Description"
        score={score.shortDescription.score}
        detail={`${score.shortDescription.charCount}/${score.shortDescription.charLimit} chars`}
        keywords={score.shortDescription.keywordsFound}
      />
      <ScoreSection
        label="Full Description"
        score={score.fullDescription.score}
        detail={`${score.fullDescription.charCount}/${score.fullDescription.charLimit} chars`}
        keywords={score.fullDescription.keywordsFound}
      />

      {/* Coverage */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-text-secondary">Keyword Coverage</span>
          <span className="text-xs font-semibold tabular-nums text-text-primary">
            {score.coverage.found}/{score.coverage.total}
          </span>
        </div>
        {/* Coverage bar */}
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              score.coverage.score >= 70 ? 'bg-emerald' : score.coverage.score >= 40 ? 'bg-amber' : 'bg-rose',
            )}
            style={{ width: `${score.coverage.score}%` }}
          />
        </div>
        {/* Missing keywords */}
        {score.coverage.missing.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-text-muted mb-1">Missing keywords:</p>
            <div className="flex flex-wrap gap-1">
              {score.coverage.missing.slice(0, 8).map((kw) => (
                <span
                  key={kw}
                  className="px-1.5 py-0.5 bg-rose/10 text-rose text-[9px] rounded cursor-default"
                  title={`Add "${kw}" to your listing`}
                >
                  {kw}
                </span>
              ))}
              {score.coverage.missing.length > 8 && (
                <span className="text-[9px] text-text-muted">
                  +{score.coverage.missing.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreSection({
  label,
  score,
  detail,
  keywords,
  missing,
}: {
  label: string
  score: number
  detail: string
  keywords: string[]
  missing?: string[]
}) {
  const Icon = score >= 60 ? CheckCircle2 : score >= 30 ? Minus : AlertCircle
  const iconColor = score >= 60 ? 'text-emerald' : score >= 30 ? 'text-amber' : 'text-rose'

  return (
    <div className="p-3 bg-surface-1 rounded-lg border border-border/50">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon size={12} className={iconColor} />
          <span className="text-[11px] font-medium text-text-primary">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">{detail}</span>
          <span className={cn(
            'text-xs font-semibold tabular-nums',
            score >= 60 ? 'text-emerald' : score >= 30 ? 'text-amber' : 'text-rose',
          )}>
            {score}
          </span>
        </div>
      </div>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {keywords.slice(0, 5).map((kw) => (
            <Badge key={kw} variant="success" className="text-[9px] px-1.5 py-0">
              {kw}
            </Badge>
          ))}
          {keywords.length > 5 && (
            <span className="text-[9px] text-text-muted">+{keywords.length - 5}</span>
          )}
        </div>
      )}
      {missing && missing.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {missing.slice(0, 3).map((kw) => (
            <span key={kw} className="text-[9px] text-rose/70">
              +{kw}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
