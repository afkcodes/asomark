import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid } from 'lucide-react'
import { projects as projectsApi } from '#/lib/api'
import { ProjectCard } from '#/components/projects/project-card'
import { CreateProjectDialog } from '#/components/projects/create-project-dialog'
import { PageLoader, EmptyState } from '#/components/ui/spinner'

export const Route = createFileRoute('/projects/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Projects</h1>
          <p className="text-sm text-text-tertiary mt-1">
            {projects?.length ?? 0} app{(projects?.length ?? 0) !== 1 ? 's' : ''} being tracked
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {/* Content */}
      {isLoading ? (
        <PageLoader />
      ) : !projects?.length ? (
        <EmptyState
          icon={<LayoutGrid size={32} />}
          title="No projects yet"
          description="Create your first project to start tracking an Android app's ASO performance"
          action={<CreateProjectDialog />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
