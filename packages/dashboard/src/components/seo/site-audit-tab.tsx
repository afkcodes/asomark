import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { EmptyState, Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { siteAudit, type SiteAuditPage } from '#/lib/api'
import { cn } from '#/lib/utils'

interface SiteAuditTabProps {
  projectId: string
}

export function SiteAuditTab({ projectId }: SiteAuditTabProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [url, setUrl] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['site-audit', projectId],
    queryFn: () => siteAudit.latest(projectId),
    refetchInterval: (query) => {
      // Poll while audit is running
      const audit = query.state.data?.audit
      return audit?.status === 'running' ? 3000 : false
    },
  })

  const runAudit = useMutation({
    mutationFn: () => siteAudit.run(projectId, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-audit', projectId] })
      toast('Site audit started — crawling your website...', 'success')
    },
    onError: (err) => {
      toast(`Audit failed: ${(err as Error).message}`, 'error')
    },
  })

  const audit = data?.audit
  const pages = data?.pages ?? []

  if (isLoading) return <div className="py-8 flex justify-center"><Spinner size={24} /></div>

  return (
    <div className="space-y-5">
      {/* Run audit form */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourwebsite.com"
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.startsWith('http')) runAudit.mutate()
            }}
          />
        </div>
        <Button
          onClick={() => runAudit.mutate()}
          disabled={!url.startsWith('http') || runAudit.isPending || audit?.status === 'running'}
        >
          {runAudit.isPending || audit?.status === 'running' ? (
            <><Spinner size={13} /> Crawling...</>
          ) : (
            <><Search size={13} /> Run Audit</>
          )}
        </Button>
      </div>

      {/* Running status */}
      {audit?.status === 'running' && (
        <Card className="border-accent/30 bg-accent/[0.02]">
          <CardContent className="py-4 flex items-center gap-3">
            <Spinner size={16} />
            <div>
              <p className="text-sm font-medium text-text-primary">Crawling {audit.siteUrl}...</p>
              <p className="text-xs text-text-tertiary">{audit.pagesCrawled} pages crawled so far</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No audit yet */}
      {!audit && (
        <EmptyState
          icon={<Search size={32} />}
          title="No site audit yet"
          description="Enter your website URL above and click 'Run Audit' to crawl your site and find SEO issues"
        />
      )}

      {/* Completed audit results */}
      {audit?.status === 'completed' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-5 gap-3">
            <ScoreCard score={audit.score ?? 0} />
            <SummaryCard
              icon={AlertCircle}
              label="Critical"
              value={audit.summary?.critical ?? 0}
              color="text-rose"
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Warnings"
              value={audit.summary?.warning ?? 0}
              color="text-amber"
            />
            <SummaryCard
              icon={Info}
              label="Info"
              value={audit.summary?.info ?? 0}
              color="text-blue-400"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Passed"
              value={audit.summary?.passed ?? 0}
              color="text-emerald"
            />
          </div>

          <p className="text-xs text-text-muted">
            Crawled {audit.pagesCrawled} pages on {audit.siteUrl} · {audit.issuesFound} issues found
          </p>

          {/* Page results */}
          <div className="space-y-2">
            {pages
              .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
              .map((page) => (
                <PageCard key={page.id} page={page} />
              ))}
          </div>
        </>
      )}

      {audit?.status === 'failed' && (
        <EmptyState
          icon={<AlertCircle size={32} />}
          title="Audit failed"
          description="The site crawl encountered an error. Check the URL and try again."
        />
      )}
    </div>
  )
}

// ─── Sub-components ───

function ScoreCard({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald' : score >= 50 ? 'text-amber' : 'text-rose'
  return (
    <Card className="p-3 flex flex-col items-center justify-center">
      <p className={cn('text-3xl font-bold tabular-nums', color)}>{score}</p>
      <p className="text-[10px] text-text-muted uppercase">SEO Score</p>
    </Card>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: typeof Info; label: string; value: number; color: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className={color} />
        <span className="text-[10px] text-text-muted uppercase">{label}</span>
      </div>
      <p className={cn('text-xl font-bold tabular-nums', value > 0 ? color : 'text-text-tertiary')}>{value}</p>
    </Card>
  )
}

function PageCard({ page }: { page: SiteAuditPage }) {
  const [expanded, setExpanded] = useState(false)
  const issues = page.issues ?? []
  const critical = issues.filter((i) => i.type === 'critical').length
  const warnings = issues.filter((i) => i.type === 'warning').length
  const infos = issues.filter((i) => i.type === 'info').length

  const scoreColor = (page.score ?? 0) >= 80 ? 'text-emerald' : (page.score ?? 0) >= 50 ? 'text-amber' : 'text-rose'

  // Shorten URL for display
  const displayUrl = (() => {
    try {
      const u = new URL(page.url)
      return u.pathname === '/' ? u.hostname : `${u.hostname}${u.pathname}`
    } catch {
      return page.url
    }
  })()

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-surface-1/50 transition-colors cursor-pointer text-left"
      >
        {expanded ? <ChevronDown size={13} className="text-text-muted shrink-0" /> : <ChevronRight size={13} className="text-text-muted shrink-0" />}

        <span className={cn('text-sm font-bold tabular-nums w-8', scoreColor)}>{page.score}</span>

        <span className="text-sm text-text-primary truncate flex-1">{displayUrl}</span>

        <div className="flex items-center gap-2 shrink-0">
          {critical > 0 && <Badge variant="danger" className="text-[9px]">{critical} critical</Badge>}
          {warnings > 0 && <Badge variant="warning" className="text-[9px]">{warnings} warning</Badge>}
          {infos > 0 && <Badge variant="muted" className="text-[9px]">{infos} info</Badge>}
          {issues.length === 0 && <Badge variant="success" className="text-[9px]">Passed</Badge>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-3 bg-surface-1/30 space-y-2 animate-fade-in">
          {/* Page meta */}
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-text-muted">Title</span>
              <p className="text-text-secondary truncate">{page.title || '(none)'}</p>
            </div>
            <div>
              <span className="text-text-muted">Words</span>
              <p className="text-text-secondary">{page.wordCount ?? 0}</p>
            </div>
            <div>
              <span className="text-text-muted">Images</span>
              <p className="text-text-secondary">{page.imageCount ?? 0} ({page.imagesWithoutAlt ?? 0} no alt)</p>
            </div>
            <div>
              <span className="text-text-muted">Links</span>
              <p className="text-text-secondary">{page.internalLinks ?? 0} int / {page.externalLinks ?? 0} ext</p>
            </div>
          </div>

          {/* Issues list */}
          {issues.length > 0 && (
            <div className="space-y-1 pt-1">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {issue.type === 'critical' && <AlertCircle size={12} className="text-rose shrink-0 mt-0.5" />}
                  {issue.type === 'warning' && <AlertTriangle size={12} className="text-amber shrink-0 mt-0.5" />}
                  {issue.type === 'info' && <Info size={12} className="text-blue-400 shrink-0 mt-0.5" />}
                  <span className="text-text-secondary">{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors mt-1"
          >
            <ExternalLink size={10} />
            Open page
          </a>
        </div>
      )}
    </div>
  )
}
