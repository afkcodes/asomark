import { Trash2, ExternalLink } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import type { App } from '#/lib/api'

interface CompetitorCardProps {
  app: App
  onRemove?: () => void
}

export function CompetitorCard({ app, onRemove }: CompetitorCardProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface-1 border border-border rounded-[var(--radius-md)] hover:border-border-hover transition-colors group">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-text-tertiary text-xs font-bold">
          {app.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{app.name}</span>
            {app.category && <Badge variant="muted">{app.category}</Badge>}
          </div>
          <p className="text-[11px] text-text-tertiary mt-0.5">{app.packageName}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {app.packageName && (
          <a
            href={`https://play.google.com/store/apps/details?id=${app.packageName}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-text-muted hover:text-text-secondary transition-colors"
          >
            <ExternalLink size={13} />
          </a>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-rose"
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  )
}
