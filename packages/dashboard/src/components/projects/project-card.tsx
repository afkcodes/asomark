import { Link } from '@tanstack/react-router'
import { ChevronRight, Globe, Hash, Users } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { cn, formatNumber } from '#/lib/utils'
import type { Project } from '#/lib/api'

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className={cn(
        'group block bg-surface-2 border border-border rounded-[var(--radius-lg)]',
        'p-5 transition-all duration-200',
        'hover:border-border-hover hover:shadow-[var(--shadow-card-hover)]',
        'hover:translate-y-[-1px]',
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* App icon placeholder — gradient circle */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/10 flex items-center justify-center text-accent text-sm font-bold">
            {project.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-hover transition-colors">
              {project.name}
            </h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {project.app?.packageName || 'Android'}
            </p>
          </div>
        </div>
        <ChevronRight
          size={14}
          className="text-text-muted group-hover:text-text-tertiary group-hover:translate-x-0.5 transition-all"
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[11px]">
        <StatItem icon={Hash} label="Keywords" value={formatNumber(project.keywordCount ?? 0)} />
        <StatItem icon={Users} label="Competitors" value={String(project.competitorCount ?? 0)} />
        <StatItem icon={Globe} label="Region" value={project.region.toUpperCase()} />
      </div>

      {/* Status badge */}
      <div className="mt-4 flex items-center gap-2">
        <Badge variant={project.isActive ? 'success' : 'muted'}>
          {project.isActive ? 'Active' : 'Paused'}
        </Badge>
        <Badge variant="default">Android</Badge>
      </div>
    </Link>
  )
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size: number }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-text-tertiary">
      <Icon size={12} />
      <span className="text-text-secondary font-medium">{value}</span>
      <span className="text-text-muted">{label}</span>
    </div>
  )
}
