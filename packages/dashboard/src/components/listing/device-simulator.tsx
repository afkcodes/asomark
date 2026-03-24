import { Star, Download, ChevronRight, ImageIcon } from 'lucide-react'
import { cn } from '#/lib/utils'

interface DeviceSimulatorProps {
  title: string
  shortDescription: string
  fullDescription: string
  appName?: string
  developerName?: string
}

export function DeviceSimulator({
  title,
  shortDescription,
  fullDescription,
  appName,
  developerName,
}: DeviceSimulatorProps) {
  const displayName = appName || title || 'App Name'
  const displayDev = developerName || 'Developer'
  const descExpanded = fullDescription.length > 200

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame */}
      <div className="w-[280px] rounded-[2rem] border-[3px] border-[#2a2a3a] bg-surface-0 shadow-2xl overflow-hidden relative">
        {/* Status bar */}
        <div className="h-7 bg-surface-0 flex items-center justify-between px-5 text-[9px] text-text-muted">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1.5 border border-text-muted rounded-sm">
              <div className="w-2 h-full bg-text-muted rounded-sm" />
            </div>
          </div>
        </div>

        {/* Play Store content */}
        <div className="h-[520px] overflow-y-auto scrollbar-thin px-4 pb-6">
          {/* App header */}
          <div className="flex items-start gap-3 py-3">
            {/* App icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/10 flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-accent">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-text-primary leading-tight line-clamp-2">
                {title || <span className="text-text-muted italic">Enter a title...</span>}
              </h3>
              <p className="text-[10px] text-emerald mt-0.5">{displayDev}</p>
              <p className="text-[10px] text-text-muted mt-0.5">Contains ads · In-app purchases</p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-3 py-2 border-y border-border/50 text-center">
            <div className="flex-1">
              <div className="flex items-center justify-center gap-0.5">
                <span className="text-[11px] font-semibold text-text-primary">4.5</span>
                <Star size={9} className="text-text-primary fill-current" />
              </div>
              <p className="text-[8px] text-text-muted mt-0.5">1K reviews</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-text-primary">10K+</p>
              <p className="text-[8px] text-text-muted mt-0.5">Downloads</p>
            </div>
            <div className="w-px h-6 bg-border/50" />
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-text-primary">E</p>
              <p className="text-[8px] text-text-muted mt-0.5">Rated for</p>
            </div>
          </div>

          {/* Install button */}
          <button className="w-full mt-3 py-2 rounded-lg bg-accent text-white text-xs font-semibold flex items-center justify-center gap-1.5">
            <Download size={12} />
            Install
          </button>

          {/* Screenshots placeholder */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-[100px] h-[178px] rounded-lg bg-surface-2 border border-border/50 flex items-center justify-center shrink-0"
              >
                <ImageIcon size={16} className="text-text-muted" />
              </div>
            ))}
          </div>

          {/* About this app */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-text-primary">About this app</h4>
              <ChevronRight size={14} className="text-text-muted" />
            </div>

            {/* Short description */}
            {shortDescription ? (
              <p className="text-[11px] text-text-secondary leading-relaxed mb-2">
                {shortDescription}
              </p>
            ) : (
              <p className="text-[11px] text-text-muted italic mb-2">
                Enter a short description...
              </p>
            )}

            {/* Full description */}
            {fullDescription ? (
              <div className="relative">
                <p
                  className={cn(
                    'text-[10px] text-text-tertiary leading-relaxed whitespace-pre-wrap',
                    descExpanded && 'line-clamp-6',
                  )}
                >
                  {fullDescription}
                </p>
                {descExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface-0 to-transparent" />
                )}
              </div>
            ) : (
              <p className="text-[10px] text-text-muted italic">
                Enter a full description...
              </p>
            )}
          </div>

          {/* Ratings section */}
          <div className="mt-4 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-text-primary mb-2">Ratings and reviews</h4>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-text-primary">4.5</span>
              <div className="flex-1 space-y-0.5">
                {[5, 4, 3, 2, 1].map((n) => (
                  <div key={n} className="flex items-center gap-1">
                    <span className="text-[8px] text-text-muted w-2">{n}</span>
                    <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${n === 5 ? 60 : n === 4 ? 25 : n === 3 ? 10 : n === 2 ? 3 : 2}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Character counts below phone */}
      <div className="mt-3 text-center space-y-0.5">
        <p className={cn(
          'text-[10px] tabular-nums',
          title.length > 30 ? 'text-rose' : title.length > 25 ? 'text-amber' : 'text-text-muted',
        )}>
          Title: {title.length}/30
        </p>
        <p className={cn(
          'text-[10px] tabular-nums',
          shortDescription.length > 80 ? 'text-rose' : shortDescription.length > 70 ? 'text-amber' : 'text-text-muted',
        )}>
          Short desc: {shortDescription.length}/80
        </p>
        <p className={cn(
          'text-[10px] tabular-nums',
          fullDescription.length > 4000 ? 'text-rose' : 'text-text-muted',
        )}>
          Full desc: {fullDescription.length}/4,000
        </p>
      </div>
    </div>
  )
}
