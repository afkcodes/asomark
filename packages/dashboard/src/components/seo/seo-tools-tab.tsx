import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Shield,
  CheckCircle2,
  XCircle,
  FileText,
  Copy,
  Check,
  Search,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent } from '#/components/ui/card'
import { Spinner } from '#/components/ui/spinner'
import { useToast } from '#/components/ui/toast'
import { crawlerAudit, llmTxt, type CrawlerAuditResult } from '#/lib/api'
import { cn } from '#/lib/utils'

interface SeoToolsTabProps {
  projectId: string
}

export function SeoToolsTab({ projectId }: SeoToolsTabProps) {
  const { toast } = useToast()
  const [url, setUrl] = useState('')
  const [auditResult, setAuditResult] = useState<CrawlerAuditResult | null>(null)
  const [llmTxtContent, setLlmTxtContent] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const runAudit = useMutation({
    mutationFn: () => crawlerAudit.check(projectId, url),
    onSuccess: (data) => {
      setAuditResult(data)
      toast(`Checked ${data.summary.total} AI crawlers — ${data.summary.allowed} allowed`, 'success')
    },
    onError: (err) => {
      toast(`Audit failed: ${(err as Error).message}`, 'error')
    },
  })

  const generateLlmTxt = useMutation({
    mutationFn: () => llmTxt.generate(projectId),
    onSuccess: (data) => {
      setLlmTxtContent(data.content)
    },
    onError: (err) => {
      toast(`Failed: ${(err as Error).message}`, 'error')
    },
  })

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast('Copied to clipboard', 'success')
  }

  return (
    <div className="space-y-8">
      {/* ─── AI Crawler Access Audit ─── */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 mb-1">
          <Shield size={14} />
          AI Crawler Access Audit
        </h3>
        <p className="text-xs text-text-tertiary mb-4">
          Check if AI bots (ChatGPT, Perplexity, Google AI, Claude) can access your website via robots.txt
        </p>

        <div className="flex items-center gap-2 mb-4">
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
            disabled={!url.startsWith('http') || runAudit.isPending}
          >
            {runAudit.isPending ? <><Spinner size={13} /> Checking...</> : <><Shield size={13} /> Check Access</>}
          </Button>
        </div>

        {auditResult && (
          <div className="space-y-3">
            {/* Score */}
            <div className="flex items-center gap-4">
              <div className={cn(
                'text-3xl font-bold tabular-nums',
                auditResult.score >= 80 ? 'text-emerald' :
                auditResult.score >= 50 ? 'text-amber' : 'text-rose',
              )}>
                {auditResult.score}%
              </div>
              <div className="text-xs text-text-tertiary">
                <p>{auditResult.summary.allowed} of {auditResult.summary.total} AI crawlers allowed</p>
                <p>{auditResult.robotsTxtFound ? 'robots.txt found' : 'No robots.txt found (all allowed by default)'}</p>
              </div>
            </div>

            {/* Crawler list */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-1 text-[10px] text-text-muted uppercase tracking-wider">
                    <th className="text-left p-3">Crawler</th>
                    <th className="text-left p-3">Organization</th>
                    <th className="text-left p-3">Purpose</th>
                    <th className="text-center p-3 w-20">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {auditResult.crawlers.map((crawler) => (
                    <tr key={crawler.agent} className="border-t border-border/50">
                      <td className="p-3 font-medium text-text-primary">{crawler.crawler}</td>
                      <td className="p-3 text-text-secondary">{crawler.org}</td>
                      <td className="p-3 text-text-tertiary text-xs">{crawler.description}</td>
                      <td className="p-3 text-center">
                        {crawler.allowed ? (
                          <CheckCircle2 size={16} className="text-emerald inline" />
                        ) : (
                          <XCircle size={16} className="text-rose inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─── LLM.txt Generator ─── */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5 mb-1">
          <FileText size={14} />
          LLM.txt Generator
        </h3>
        <p className="text-xs text-text-tertiary mb-4">
          Generate an <code className="px-1 bg-surface-1 rounded text-[11px]">llm.txt</code> file
          that tells AI crawlers what your site is about. Place it at your website root
          (e.g. <code className="px-1 bg-surface-1 rounded text-[11px]">yoursite.com/llm.txt</code>).
        </p>

        <Button
          variant="secondary"
          onClick={() => generateLlmTxt.mutate()}
          disabled={generateLlmTxt.isPending}
        >
          {generateLlmTxt.isPending ? <><Spinner size={13} /> Generating...</> : <><FileText size={13} /> Generate llm.txt</>}
        </Button>

        {llmTxtContent && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Preview</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(llmTxtContent)}
              >
                {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
              </Button>
            </div>
            <pre className="bg-surface-1 border border-border rounded-lg p-4 text-xs text-text-secondary overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {llmTxtContent}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
