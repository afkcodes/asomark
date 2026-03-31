import { createFileRoute, Link, Outlet, useNavigate, useMatches } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  ArrowLeft,
  Hash,
  Users,
  FileText,
  LayoutDashboard,
  Rocket,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { PageLoader, EmptyState, Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import {
  projects as projectsApi,
  type ProjectDetail,
  type DiscoveredKeyword,
} from '#/lib/api'
import { ProjectCtx } from '#/lib/project-context'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayout,
})

function ProjectLayout() {
  const { projectId } = Route.useParams()

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  })

  const { data: keywords = [], isFetching: keywordsFetching } = useQuery({
    queryKey: ['project-keywords', projectId],
    queryFn: () => projectsApi.keywords(projectId),
    enabled: !!project,
  })

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast('Project deleted')
      navigate({ to: '/projects' })
    },
  })

  if (isLoading) return <PageLoader />
  if (!project) return <EmptyState title="Project not found" />

  const isPreLaunch = project.mode === 'pre_launch'

  return (
    <div>
      <ProjectHeader
        project={project}
        keywords={keywords}
        onDelete={() => deleteMutation.mutate()}
        isDeleting={deleteMutation.isPending}
      />

      <ProjectNav projectId={projectId} isPreLaunch={isPreLaunch} keywords={keywords} project={project} />

      <div className="mt-6">
        <ProjectCtx.Provider value={{ project, keywords, projectId, keywordsFetching }}>
          <Outlet />
        </ProjectCtx.Provider>
      </div>
    </div>
  )
}

// ─── Navigation ───

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '', both: true },
  { id: 'keywords', label: 'Keywords', icon: Hash, path: '/keywords', both: true },
  { id: 'competitors', label: 'Competitors', icon: Users, path: '/competitors', both: true },
  { id: 'listing', label: 'Listing', icon: FileText, path: '/listing', both: true },
  { id: 'tracking', label: 'Tracking', icon: TrendingUp, path: '/tracking', liveOnly: true },
]

function ProjectNav({
  projectId,
  isPreLaunch,
  keywords,
  project,
}: {
  projectId: string
  isPreLaunch: boolean
  keywords: DiscoveredKeyword[]
  project: ProjectDetail
}) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.pathname ?? ''
  const basePath = `/projects/${projectId}`

  const items = NAV_ITEMS.filter((item) => {
    if (item.liveOnly && isPreLaunch) return false
    return true
  })

  return (
    <div className="mt-6 flex gap-1 border-b border-border pb-px">
      {items.map((item) => {
        const fullPath = `${basePath}${item.path}`
        const isActive = item.path === ''
          ? currentPath === basePath || currentPath === `${basePath}/`
          : currentPath.startsWith(fullPath)

        let count: number | null = null
        if (item.id === 'keywords' && keywords.length > 0) count = keywords.length
        if (item.id === 'competitors' && project.competitors) count = project.competitors.length

        return (
          <Link
            key={item.id}
            to={fullPath}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors',
              isActive
                ? 'text-text-primary border-b-2 border-accent -mb-px'
                : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            <item.icon size={13} />
            {item.label}
            {count != null && (
              <span className="text-[10px] text-text-muted">{count}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ─── Header ───

function ProjectHeader({
  project,
  keywords,
  onDelete,
  isDeleting,
}: {
  project: ProjectDetail
  keywords: DiscoveredKeyword[]
  onDelete: () => void
  isDeleting: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tracking = keywords.filter((k) => k.isTracking).length
  const ranked = keywords.filter((k) => k.myRank != null).length

  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-4">
        <Link
          to="/projects"
          className="p-2 -ml-2 text-text-tertiary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-accent/20 to-accent/5 border border-accent/10 flex items-center justify-center text-accent font-bold">
          {project.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-text-primary">{project.name}</h1>
            {project.mode === 'pre_launch' && (
              <Badge variant="accent" className="text-[9px]">
                <Rocket size={9} className="mr-0.5" />
                Pre-Launch
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-text-tertiary">
            {project.mode === 'pre_launch' ? (
              <>
                <span>{(project.seedKeywords ?? []).join(', ')}</span>
                <span>|</span>
                <span>{project.region.toUpperCase()}</span>
                <span>|</span>
                <span>{keywords.length} keywords discovered</span>
              </>
            ) : (
              <>
                <span>{project.app?.packageName}</span>
                <span>|</span>
                <span>{project.region.toUpperCase()}</span>
                <span>|</span>
                <span>
                  {keywords.length} keywords, {tracking} tracking, {ranked} ranked
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Delete this project?</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner className="w-3 h-3" /> : <Trash2 size={13} />}
              <span className="ml-1">Delete</span>
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-text-tertiary hover:text-red-400"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}
