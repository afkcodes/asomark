import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain,
  CheckCircle2,
  XCircle,
  Minus,
  Eye,
  TrendingUp,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { EmptyState, Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { aiVisibility, type AiVisibilityCheck } from '#/lib/api'
import { cn, formatDate } from '#/lib/utils'

interface AiVisibilityTabProps {
  projectId: string
}

export function AiVisibilityTab({ projectId }: AiVisibilityTabProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [newPrompt, setNewPrompt] = useState('')

  const { data: statsData } = useQuery({
    queryKey: ['ai-visibility-stats', projectId],
    queryFn: () => aiVisibility.stats(projectId),
  })

  const { data: historyData } = useQuery({
    queryKey: ['ai-visibility-history', projectId],
    queryFn: () => aiVisibility.history(projectId),
  })

  const { data: promptsData } = useQuery({
    queryKey: ['ai-visibility-prompts', projectId],
    queryFn: () => aiVisibility.prompts(projectId),
  })

  const runCheck = useMutation({
    mutationFn: () => aiVisibility.check(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-visibility-stats', projectId] })
      queryClient.invalidateQueries({ queryKey: ['ai-visibility-history', projectId] })
      toast(`Checked ${data.checked} prompts — mentioned in ${data.mentionRate}%`, 'success')
    },
    onError: (err) => {
      toast(`Check failed: ${(err as Error).message}`, 'error')
    },
  })

  const addPrompt = useMutation({
    mutationFn: () => aiVisibility.addPrompt(projectId, newPrompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-visibility-prompts', projectId] })
      setNewPrompt('')
      toast('Prompt added', 'success')
    },
  })

  const deletePrompt = useMutation({
    mutationFn: (promptId: string) => aiVisibility.deletePrompt(projectId, promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-visibility-prompts', projectId] })
    },
  })

  const stats = statsData
  const history = historyData?.data ?? []
  const prompts = promptsData?.data ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Brain size={14} />
            AI Visibility
          </h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Check if AI assistants mention your brand when users ask for app recommendations
          </p>
        </div>
        <Button
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
        >
          {runCheck.isPending ? (
            <><Spinner size={13} /> Checking {prompts.length} prompts...</>
          ) : (
            <><Eye size={13} /> Check AI Visibility</>
          )}
        </Button>
      </div>

      {/* Stats cards */}
      {stats?.hasData && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-[10px] text-text-muted uppercase mb-1">Mention Rate</p>
            <p className={cn(
              'text-2xl font-bold tabular-nums',
              (stats.mentionRate ?? 0) >= 50 ? 'text-emerald' :
              (stats.mentionRate ?? 0) >= 20 ? 'text-amber' : 'text-rose',
            )}>
              {stats.mentionRate}%
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-text-muted uppercase mb-1">Avg Position</p>
            <p className="text-2xl font-bold tabular-nums text-accent">
              {stats.avgPosition ? `#${stats.avgPosition}` : '—'}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-text-muted uppercase mb-1">Sentiment</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-emerald">{stats.sentimentBreakdown?.positive ?? 0} +</span>
              <span className="text-xs text-text-muted">{stats.sentimentBreakdown?.neutral ?? 0} ~</span>
              <span className="text-xs text-rose">{stats.sentimentBreakdown?.negative ?? 0} -</span>
            </div>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-text-muted uppercase mb-1">Total Checks</p>
            <p className="text-2xl font-bold tabular-nums text-text-primary">{stats.totalChecks}</p>
          </Card>
        </div>
      )}

      {/* Competitor mentions */}
      {stats?.topCompetitors && stats.topCompetitors.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Competitors AI Mentions Most</p>
            <div className="flex flex-wrap gap-2">
              {stats.topCompetitors.map((comp) => (
                <Badge key={comp.name} variant="muted" className="text-xs">
                  {comp.name} <span className="ml-1 opacity-60">({comp.count}x)</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Prompts management */}
      <div>
        <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
          Prompts to Check ({prompts.length})
        </h4>
        <div className="space-y-1 mb-3">
          {prompts.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm text-text-secondary group">
              <span className="flex-1 truncate">{p.prompt}</span>
              <Badge variant="muted" className="text-[8px] shrink-0">{p.category}</Badge>
              <button
                onClick={() => deletePrompt.mutate(p.id)}
                className="text-text-muted hover:text-rose transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Add a custom prompt... e.g. 'best offline expense tracker'"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newPrompt.trim()) addPrompt.mutate()
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addPrompt.mutate()}
            disabled={!newPrompt.trim()}
          >
            <Plus size={12} /> Add
          </Button>
        </div>
      </div>

      {/* Check history */}
      {history.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
            Recent Checks
          </h4>
          <div className="space-y-2">
            {history.map((check) => (
              <CheckCard key={check.id} check={check} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!stats?.hasData && prompts.length === 0 && (
        <EmptyState
          icon={<Brain size={32} />}
          title="No AI visibility data yet"
          description="Click 'Check AI Visibility' to see if AI assistants mention your brand. Default prompts will be auto-generated."
          action={
            <Button onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
              <Eye size={13} /> Check AI Visibility
            </Button>
          }
        />
      )}
    </div>
  )
}

function CheckCard({ check }: { check: AiVisibilityCheck }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-surface-1/50 transition-colors cursor-pointer text-left"
      >
        {expanded ? <ChevronDown size={13} className="text-text-muted shrink-0" /> : <ChevronRight size={13} className="text-text-muted shrink-0" />}

        {check.mentioned ? (
          <CheckCircle2 size={14} className="text-emerald shrink-0" />
        ) : (
          <XCircle size={14} className="text-rose shrink-0" />
        )}

        <span className="text-sm text-text-primary truncate flex-1">{check.prompt}</span>

        <div className="flex items-center gap-2 shrink-0">
          {check.mentioned && check.position && (
            <Badge variant="accent" className="text-[9px]">#{check.position}</Badge>
          )}
          {check.mentioned && (
            <Badge
              variant={check.sentiment === 'positive' ? 'success' : check.sentiment === 'negative' ? 'danger' : 'muted'}
              className="text-[9px]"
            >
              {check.sentiment}
            </Badge>
          )}
          <span className="text-[10px] text-text-muted">{check.platform}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 p-3 bg-surface-1/30 animate-fade-in">
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap line-clamp-10">
            {check.response}
          </p>
          {check.competitors_mentioned && check.competitors_mentioned.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[10px] text-text-muted">Also mentioned:</span>
              {check.competitors_mentioned.map((comp) => (
                <Badge key={comp} variant="muted" className="text-[9px]">{comp}</Badge>
              ))}
            </div>
          )}
          <span className="text-[10px] text-text-muted mt-2 block">{formatDate(check.checkedAt, true)}</span>
        </div>
      )}
    </div>
  )
}
