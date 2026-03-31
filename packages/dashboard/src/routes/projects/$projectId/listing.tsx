import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Save, Info } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { ListingEditor } from '#/components/listing/listing-editor'
import { projects as projectsApi, listings, type ProjectDetail } from '#/lib/api'
import { useProjectContext } from '#/lib/project-context'

export const Route = createFileRoute('/projects/$projectId/listing')({
  component: ListingSection,
})

function ListingSection() {
  const { project, keywords, projectId } = useProjectContext()
  const isPreLaunch = project.mode === 'pre_launch'

  // For live apps, fetch the current Play Store listing
  const { data: currentListing } = useQuery({
    queryKey: ['listing-latest', project.appId],
    queryFn: () => listings.latest(project.appId),
    enabled: !isPreLaunch,
  })

  return (
    <div className="space-y-6">
      {/* App Context Card — different behavior for pre-launch vs live */}
      {isPreLaunch ? (
        <AppContextCard project={project} projectId={projectId} />
      ) : (
        <LiveAppContext project={project} currentListing={currentListing} />
      )}

      {/* Listing Editor */}
      <ListingEditor
        projectId={projectId}
        projectName={project.name}
        keywords={keywords}
        storeListing={!isPreLaunch ? currentListing : undefined}
      />
    </div>
  )
}

// ─── Live App Context (auto-populated from Play Store) ───

function LiveAppContext({
  project,
  currentListing,
}: {
  project: ProjectDetail
  currentListing?: { title?: string | null; shortDesc?: string | null; longDesc?: string | null; rating?: number | null; installsText?: string | null } | null
}) {
  if (!currentListing?.title) return null

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Info size={13} className="text-accent" />
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
            Current Play Store Listing
          </h3>
        </div>
        <div className="space-y-2">
          <div>
            <span className="text-[10px] text-text-muted uppercase">Title</span>
            <p className="text-sm text-text-primary">{currentListing.title}</p>
          </div>
          {currentListing.shortDesc && (
            <div>
              <span className="text-[10px] text-text-muted uppercase">Short Description</span>
              <p className="text-sm text-text-secondary">{currentListing.shortDesc}</p>
            </div>
          )}
          {currentListing.longDesc && (
            <div>
              <span className="text-[10px] text-text-muted uppercase">Description Preview</span>
              <p className="text-sm text-text-secondary line-clamp-3">{currentListing.longDesc}</p>
            </div>
          )}
          <div className="flex gap-4 pt-1">
            {currentListing.rating != null && (
              <span className="text-xs text-text-muted">
                Rating: <span className="text-text-primary font-medium">{currentListing.rating.toFixed(1)}</span>
              </span>
            )}
            {currentListing.installsText && (
              <span className="text-xs text-text-muted">
                Installs: <span className="text-text-primary font-medium">{currentListing.installsText}</span>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Pre-launch App Context Card (user fills in) ───

function AppContextCard({
  project,
  projectId,
}: {
  project: ProjectDetail
  projectId: string
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [appDescription, setAppDescription] = useState(project.appDescription ?? '')
  const [targetAudience, setTargetAudience] = useState(project.targetAudience ?? '')
  const [keyFeatures, setKeyFeatures] = useState<string[]>(project.keyFeatures ?? [])
  const [featureInput, setFeatureInput] = useState('')

  const save = useMutation({
    mutationFn: () =>
      projectsApi.update(projectId, {
        appDescription: appDescription || undefined,
        keyFeatures: keyFeatures.length > 0 ? keyFeatures : undefined,
        targetAudience: targetAudience || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast('App context saved', 'success')
      setEditing(false)
    },
    onError: (err) => {
      toast(`Failed to save: ${(err as Error).message}`, 'error')
    },
  })

  const hasContext = project.appDescription || (project.keyFeatures && project.keyFeatures.length > 0) || project.targetAudience

  if (!editing && !hasContext) {
    return (
      <Card className="border-dashed border-accent/30 bg-accent/[0.02]">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Tell the AI about your app</h3>
              <p className="text-xs text-text-tertiary mt-0.5">
                Without this, listing generation guesses what your app does based on keywords alone.
              </p>
            </div>
            <Button size="sm" onClick={() => setEditing(true)}>
              Add App Details
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!editing) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">App Context</h3>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
            >
              Edit
            </button>
          </div>
          {project.appDescription && (
            <p className="text-sm text-text-secondary mb-2">{project.appDescription}</p>
          )}
          {project.keyFeatures && project.keyFeatures.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {project.keyFeatures.map((f) => (
                <span key={f} className="px-2 py-0.5 bg-emerald/10 text-emerald text-xs rounded-md">{f}</span>
              ))}
            </div>
          )}
          {project.targetAudience && (
            <p className="text-xs text-text-muted">Audience: {project.targetAudience}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">App Context</h3>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">What does your app do?</label>
          <textarea
            value={appDescription}
            onChange={(e) => setAppDescription(e.target.value)}
            placeholder="A personal finance app that helps users track daily expenses..."
            rows={2}
            className="w-full bg-surface-1 border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none hover:border-border-hover focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Key Features</label>
          <div className="min-h-[38px] flex flex-wrap gap-1.5 p-2 bg-surface-1 border border-border rounded-[var(--radius-md)] focus-within:border-accent transition-colors">
            {keyFeatures.map((feat) => (
              <span key={feat} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald/10 text-emerald text-xs rounded-md">
                {feat}
                <button
                  onClick={() => setKeyFeatures(keyFeatures.filter((f) => f !== feat))}
                  className="hover:text-emerald-hover cursor-pointer text-[10px]"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={featureInput}
              onChange={(e) => setFeatureInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const feat = featureInput.trim()
                  if (feat && !keyFeatures.includes(feat)) setKeyFeatures([...keyFeatures, feat])
                  setFeatureInput('')
                }
              }}
              onBlur={() => {
                const feat = featureInput.trim()
                if (feat && !keyFeatures.includes(feat)) setKeyFeatures([...keyFeatures, feat])
                setFeatureInput('')
              }}
              placeholder={keyFeatures.length === 0 ? 'Budget tracking, Bill reminders...' : ''}
              className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-text-secondary mb-1 block">Target Audience</label>
          <Input
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="Young professionals managing personal finances"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Spinner size={12} /> : <Save size={12} />}
            <span className="ml-1">Save</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
