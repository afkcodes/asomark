import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save,
  FileText,
  Sparkles,
  ChevronDown,
  Check,
  Star,
  AlertTriangle,
  Clock,
  Target,
  TrendingUp,
  Swords,
  Crosshair,
  Scale,
} from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Spinner } from '#/components/ui/spinner'
import { DeviceSimulator } from './device-simulator'
import { ListingScoreCard } from './listing-score-card'
import { cn } from '#/lib/utils'
import {
  projects as projectsApi,
  type ListingScore,
  type ListingVariantData,
  type ListingCreatorReport,
  type DiscoveredKeyword,
} from '#/lib/api'

interface ListingEditorProps {
  projectId: string
  projectName: string
  keywords: DiscoveredKeyword[]
  /** Pre-populated from Play Store listing (for live apps) */
  storeListing?: {
    title?: string | null
    shortDesc?: string | null
    longDesc?: string | null
  } | null
}

const STRATEGY_META: Record<string, { icon: typeof Target; label: string; color: string }> = {
  keyword_max: { icon: Target, label: 'Keyword Max', color: 'text-blue-400' },
  conversion: { icon: TrendingUp, label: 'Conversion', color: 'text-emerald' },
  competitive: { icon: Swords, label: 'Competitive', color: 'text-amber' },
  long_tail: { icon: Crosshair, label: 'Long Tail', color: 'text-violet-400' },
  balanced: { icon: Scale, label: 'Balanced', color: 'text-accent' },
}

export function ListingEditor({ projectId, projectName, keywords, storeListing }: ListingEditorProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [appName, setAppName] = useState('')
  const [developerName, setDeveloperName] = useState('')
  const [score, setScore] = useState<ListingScore | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [generationReport, setGenerationReport] = useState<ListingCreatorReport | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Load existing draft
  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ['listing-draft', projectId],
    queryFn: () => projectsApi.getListingDraft(projectId),
  })

  // Load versions
  const { data: versions } = useQuery({
    queryKey: ['listing-versions', projectId],
    queryFn: () => projectsApi.listingVersions(projectId),
  })

  // Initialize from draft, or from Play Store listing if no draft exists
  useEffect(() => {
    if (draft) {
      setTitle(draft.title || '')
      setShortDescription(draft.shortDescription || '')
      setFullDescription(draft.fullDescription || '')
      setAppName(draft.appName || projectName)
      setDeveloperName(draft.developerName || '')
    } else if (!draftLoading) {
      setAppName(projectName)
      // Auto-fill from Play Store listing if available (live apps)
      if (storeListing) {
        if (storeListing.title && !title) setTitle(storeListing.title)
        if (storeListing.shortDesc && !shortDescription) setShortDescription(storeListing.shortDesc)
        if (storeListing.longDesc && !fullDescription) setFullDescription(storeListing.longDesc)
      }
    }
  }, [draft, draftLoading, projectName, storeListing])

  // Save draft mutation
  const saveDraft = useMutation({
    mutationFn: () => {
      setIsSaving(true)
      return projectsApi.saveListingDraft(projectId, {
        title,
        shortDescription,
        fullDescription,
        appName,
        developerName,
      })
    },
    onSettled: () => setIsSaving(false),
  })

  // Score listing mutation
  const scoreListing = useMutation({
    mutationFn: () =>
      projectsApi.scoreListing(projectId, {
        title,
        shortDescription,
        fullDescription,
      }),
    onSuccess: (data) => setScore(data),
  })

  // Generate listing mutation
  const generateListing = useMutation({
    mutationFn: () => projectsApi.generateListing(projectId),
    onSuccess: (data) => {
      setGenerationReport(data)
      // Reload draft and versions
      queryClient.invalidateQueries({ queryKey: ['listing-draft', projectId] })
      queryClient.invalidateQueries({ queryKey: ['listing-versions', projectId] })
    },
  })

  // Activate variant mutation
  const activateVariant = useMutation({
    mutationFn: (variantId: string) =>
      projectsApi.activateVariant(projectId, variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listing-draft', projectId] })
      queryClient.invalidateQueries({ queryKey: ['listing-versions', projectId] })
    },
  })

  // Debounced auto-save (no auto-scoring — user triggers score manually)
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      saveDraft.mutate()
    }, 1000)
  }, [title, shortDescription, fullDescription, appName, developerName])

  // Trigger auto-save on content change
  useEffect(() => {
    if (!draftLoading) {
      scheduleAutoSave()
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [title, shortDescription, fullDescription, appName, developerName, draftLoading])

  // Auto-score on initial load when content is present (from draft or store listing)
  const hasScored = useRef(false)
  useEffect(() => {
    if (!hasScored.current && !draftLoading && (title || shortDescription || fullDescription)) {
      hasScored.current = true
      scoreListing.mutate()
    }
  }, [draftLoading, title, shortDescription, fullDescription])

  // Get top keywords for highlighting
  const topKeywords = keywords
    .filter((k) => k.isTracking || k.myRank != null)
    .slice(0, 20)
    .map((k) => k.keyword)

  // Get selected version's variants
  const selectedVersion = selectedVersionId
    ? versions?.find((v) => v.id === selectedVersionId)
    : versions?.[0]

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Generate + Version History */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <FileText size={14} />
            Listing Editor
          </h3>
          {isSaving && (
            <span className="text-[10px] text-text-muted flex items-center gap-1">
              <Spinner size={10} /> Saving...
            </span>
          )}
          {!isSaving && saveDraft.isSuccess && (
            <span className="text-[10px] text-emerald flex items-center gap-1">
              <Save size={10} /> Saved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Version History Dropdown */}
          {versions && versions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-1 border border-border rounded-lg text-[11px] text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
              >
                <Clock size={12} />
                v{selectedVersion?.versionNumber ?? '?'}
                <ChevronDown size={10} />
              </button>
              {showVersions && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-surface-1 border border-border rounded-lg shadow-lg z-20 py-1">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVersionId(v.id)
                        setShowVersions(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-[11px] hover:bg-surface-2 transition-colors',
                        selectedVersion?.id === v.id
                          ? 'text-accent'
                          : 'text-text-secondary',
                      )}
                    >
                      <span>
                        v{v.versionNumber} — {v.generationMethod === 'agent' ? 'AI Generated' : 'Manual'}
                      </span>
                      <span className="text-text-muted">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generate Button */}
          <div className="relative group">
            <button
              onClick={() => generateListing.mutate()}
              disabled={generateListing.isPending}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                generateListing.isPending
                  ? 'bg-accent/20 text-accent cursor-wait'
                  : 'bg-accent text-white hover:bg-accent/90 shadow-sm',
              )}
            >
              {generateListing.isPending ? (
                <>
                  <Spinner size={12} />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Generate with AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Generation Progress */}
      {generateListing.isPending && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Spinner size={14} />
            <span className="text-xs font-medium text-accent">ASO Agent is working...</span>
          </div>
          <div className="space-y-1.5">
            {['Analyzing keyword relevance', 'Scraping competitor listings', 'Generating 5 strategic variants', 'Scoring and ranking'].map((step, i) => (
              <div key={step} className="flex items-center gap-2 text-[11px] text-text-muted">
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  i === 0 ? 'bg-accent animate-pulse' : 'bg-surface-2',
                )} />
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation Error */}
      {generateListing.isError && (
        <div className="bg-rose/5 border border-rose/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-rose mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-rose">Generation Failed</p>
            <p className="text-[11px] text-text-muted mt-0.5">
              {generateListing.error instanceof Error
                ? generateListing.error.message
                : 'Unknown error'}
            </p>
          </div>
        </div>
      )}

      {/* Variant Comparison Panel */}
      {selectedVersion && selectedVersion.variants.length > 0 && (
        <VariantComparisonPanel
          variants={selectedVersion.variants}
          versionNumber={selectedVersion.versionNumber}
          report={generationReport}
          onActivate={(variantId) => activateVariant.mutate(variantId)}
          isActivating={activateVariant.isPending}
        />
      )}

      {/* Main Editor Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Editor Panel */}
        <div className="col-span-5 space-y-5">
          {/* App Name */}
          <FieldGroup label="App Name" hint="Display name shown in the store">
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="My App"
              className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </FieldGroup>

          {/* Title */}
          <FieldGroup
            label="Title"
            hint={`${title.length}/50 characters`}
            warning={title.length > 50}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 60))}
              placeholder="Expense Tracker - Budget Manager & Money Planner"
              className={cn(
                'w-full bg-surface-1 border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none',
                title.length > 50
                  ? 'border-rose focus:border-rose'
                  : 'border-border focus:border-accent',
              )}
            />
            <KeywordBadges text={title} keywords={topKeywords} />
          </FieldGroup>

          {/* Short Description */}
          <FieldGroup
            label="Short Description"
            hint={`${shortDescription.length}/80 characters`}
            warning={shortDescription.length > 80}
          >
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value.slice(0, 100))}
              placeholder="Track daily expenses, manage budgets, and save money effortlessly"
              rows={2}
              className={cn(
                'w-full bg-surface-1 border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none resize-none',
                shortDescription.length > 80
                  ? 'border-rose focus:border-rose'
                  : 'border-border focus:border-accent',
              )}
            />
            <KeywordBadges text={shortDescription} keywords={topKeywords} />
          </FieldGroup>

          {/* Full Description */}
          <FieldGroup
            label="Full Description"
            hint={`${fullDescription.length}/4,000 characters`}
            warning={fullDescription.length > 4000}
          >
            <textarea
              value={fullDescription}
              onChange={(e) => setFullDescription(e.target.value.slice(0, 4500))}
              placeholder="Write a detailed description of your app features, benefits, and use cases..."
              rows={10}
              className={cn(
                'w-full bg-surface-1 border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none resize-none',
                fullDescription.length > 4000
                  ? 'border-rose focus:border-rose'
                  : 'border-border focus:border-accent',
              )}
            />
            <KeywordBadges text={fullDescription} keywords={topKeywords} />
          </FieldGroup>

          {/* Developer Name */}
          <FieldGroup label="Developer Name" hint="Your developer or company name">
            <input
              value={developerName}
              onChange={(e) => setDeveloperName(e.target.value)}
              placeholder="Your Name / Company"
              className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </FieldGroup>
        </div>

        {/* Device Simulator */}
        <div className="col-span-4 flex justify-center sticky top-4 self-start">
          <DeviceSimulator
            title={title}
            shortDescription={shortDescription}
            fullDescription={fullDescription}
            appName={appName}
            developerName={developerName}
          />
        </div>

        {/* Score Card */}
        <div className="col-span-3 sticky top-4 self-start">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Optimization Score
            </h3>
            <button
              onClick={() => scoreListing.mutate()}
              disabled={scoreListing.isPending || (!title && !shortDescription && !fullDescription)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                scoreListing.isPending
                  ? 'bg-accent/20 text-accent cursor-wait'
                  : !title && !shortDescription && !fullDescription
                    ? 'bg-surface-2 text-text-muted cursor-not-allowed'
                    : 'bg-accent/10 text-accent hover:bg-accent/20',
              )}
            >
              {scoreListing.isPending ? (
                <><Spinner size={10} /> Scoring...</>
              ) : (
                <><Target size={10} /> {score ? 'Rescore' : 'Get Score'}</>
              )}
            </button>
          </div>
          <ListingScoreCard score={score} isLoading={scoreListing.isPending} />
        </div>
      </div>
    </div>
  )
}

// ─── Variant Comparison Panel ───

function VariantComparisonPanel({
  variants,
  versionNumber,
  report,
  onActivate,
  isActivating,
}: {
  variants: ListingVariantData[]
  versionNumber: number
  report: ListingCreatorReport | null
  onActivate: (variantId: string) => void
  isActivating: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-secondary">
          v{versionNumber} — {variants.length} Variants
        </h4>
        {report && (
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span>{report.keywordsAccepted} keywords used</span>
            <span>{report.competitorsAnalyzed} competitors analyzed</span>
          </div>
        )}
      </div>

      {/* Variant Cards — Horizontal Scroll */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {variants.map((variant, i) => {
          const meta = STRATEGY_META[variant.strategyName] ?? {
            icon: Target,
            label: variant.strategyName,
            color: 'text-text-secondary',
          }
          const Icon = meta.icon
          const isBest = report?.bestVariantIndex === i
          const isActive = variant.isActive

          return (
            <div
              key={variant.id}
              className={cn(
                'flex-shrink-0 w-64 bg-surface-1 border rounded-lg p-3 space-y-2.5 transition-all',
                isActive
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-border hover:border-accent/30',
              )}
            >
              {/* Strategy header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className={meta.color} />
                  <span className={cn('text-[11px] font-medium', meta.color)}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isBest && (
                    <Badge variant="accent" className="text-[8px] px-1.5 py-0">
                      <Star size={8} className="mr-0.5" />
                      Best
                    </Badge>
                  )}
                  {isActive && (
                    <Badge variant="success" className="text-[8px] px-1.5 py-0">
                      <Check size={8} className="mr-0.5" />
                      Active
                    </Badge>
                  )}
                </div>
              </div>

              {/* Title preview */}
              <div>
                <p className="text-[10px] text-text-muted mb-0.5">Title</p>
                <p className="text-xs text-text-primary font-medium leading-snug line-clamp-2">
                  {variant.title}
                </p>
              </div>

              {/* Short desc preview */}
              <div>
                <p className="text-[10px] text-text-muted mb-0.5">Short Description</p>
                <p className="text-[11px] text-text-secondary leading-snug line-clamp-2">
                  {variant.shortDescription}
                </p>
              </div>

              {/* Score bar */}
              {variant.scores && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-muted">ASO Score</span>
                    <span
                      className={cn(
                        'text-xs font-semibold tabular-nums',
                        variant.scores.overall >= 70
                          ? 'text-emerald'
                          : variant.scores.overall >= 40
                            ? 'text-amber'
                            : 'text-rose',
                      )}
                    >
                      {variant.scores.overall}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        variant.scores.overall >= 70
                          ? 'bg-emerald'
                          : variant.scores.overall >= 40
                            ? 'bg-amber'
                            : 'bg-rose',
                      )}
                      style={{ width: `${variant.scores.overall}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-text-muted">
                    <span>T:{variant.scores.title}</span>
                    <span>S:{variant.scores.shortDesc}</span>
                    <span>D:{variant.scores.fullDesc}</span>
                    <span>C:{variant.scores.coverage}</span>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {variant.warnings && variant.warnings.length > 0 && (
                <div className="flex items-center gap-1 text-[9px] text-amber">
                  <AlertTriangle size={9} />
                  {variant.warnings.length} warning{variant.warnings.length > 1 ? 's' : ''}
                </div>
              )}

              {/* Use This button */}
              {!isActive && (
                <button
                  onClick={() => onActivate(variant.id)}
                  disabled={isActivating}
                  className="w-full py-1.5 bg-accent/10 text-accent text-[11px] font-medium rounded-md hover:bg-accent/20 transition-colors disabled:opacity-50"
                >
                  {isActivating ? 'Applying...' : 'Use This Variant'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Recommendations from report */}
      {report && report.recommendations.length > 0 && (
        <div className="bg-surface-1 border border-border rounded-lg p-3">
          <p className="text-[10px] font-semibold text-text-secondary mb-1.5">
            Agent Recommendations
          </p>
          <ul className="space-y-1">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="text-[11px] text-text-muted flex items-start gap-1.5">
                <span className="text-accent mt-0.5">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───

function FieldGroup({
  label,
  hint,
  warning,
  children,
}: {
  label: string
  hint: string
  warning?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        <span
          className={cn(
            'text-[10px] tabular-nums',
            warning ? 'text-rose' : 'text-text-muted',
          )}
        >
          {hint}
        </span>
      </div>
      {children}
    </div>
  )
}

function KeywordBadges({
  text,
  keywords,
}: {
  text: string
  keywords: string[]
}) {
  if (keywords.length === 0) return null

  const textLower = text.toLowerCase()
  const found = keywords.filter((kw) => textLower.includes(kw.toLowerCase()))
  const notFound = keywords
    .filter((kw) => !textLower.includes(kw.toLowerCase()))
    .slice(0, 5)

  if (found.length === 0 && notFound.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {found.map((kw) => (
        <Badge key={kw} variant="success" className="text-[9px] px-1.5 py-0">
          {kw}
        </Badge>
      ))}
      {notFound.map((kw) => (
        <Badge
          key={kw}
          variant="muted"
          className="text-[9px] px-1.5 py-0 opacity-50"
        >
          {kw}
        </Badge>
      ))}
    </div>
  )
}
