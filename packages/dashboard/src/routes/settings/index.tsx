import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Key, Eye, EyeOff, Save, ExternalLink } from 'lucide-react'
import { settingsApi } from '#/lib/api'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { useToast } from '#/components/ui/toast'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

const providers = [
  {
    key: 'openrouter_api_key' as const,
    label: 'OpenRouter',
    description: 'Access 100+ models through a single API. Highest priority when set.',
    placeholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    key: 'anthropic_api_key' as const,
    label: 'Anthropic (Claude)',
    description: 'Direct access to Claude models. Used when OpenRouter key is not set.',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    key: 'openai_api_key' as const,
    label: 'OpenAI',
    description: 'Access to GPT models. Used as fallback when other keys are not set.',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
] as const

function SettingsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const [dirty, setDirty] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  useEffect(() => {
    if (settings) {
      const initial: Record<string, string> = {}
      for (const p of providers) {
        initial[p.key] = ''
      }
      setValues(initial)
      setDirty(false)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const toSave: Record<string, string> = {}
      for (const p of providers) {
        const val = values[p.key]
        if (val !== undefined && val !== '') {
          toSave[p.key] = val
        }
      }
      if (Object.keys(toSave).length === 0) return
      await settingsApi.save(toSave)
    },
    onSuccess: () => {
      toast('API keys saved', 'success')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setDirty(false)
    },
    onError: (err) => {
      toast(`Failed to save: ${err.message}`, 'error')
    },
  })

  const clearKey = useMutation({
    mutationFn: async (key: string) => {
      await settingsApi.save({ [key]: '' })
    },
    onSuccess: (_data, key) => {
      const label = providers.find((p) => p.key === key)?.label ?? key
      toast(`${label} key removed`, 'success')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setValues((prev) => ({ ...prev, [key]: '' }))
    },
    onError: (err) => {
      toast(`Failed to remove: ${err.message}`, 'error')
    },
  })

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-tertiary mt-1">
          Configure API keys for AI agent intelligence. Keys stored in DB override environment variables.
        </p>
      </div>

      <div className="space-y-6">
        {/* API Keys Section */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Key size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">LLM API Keys</h2>
          </div>
          <p className="text-xs text-text-muted mb-5">
            At least one key is required for AI agents to work. Priority: OpenRouter &gt; Anthropic &gt; OpenAI.
          </p>

          <div className="space-y-5">
            {providers.map((provider) => {
              const savedValue = settings?.[provider.key]
              const hasSaved = savedValue !== null
              const isVisible = visible[provider.key] ?? false

              return (
                <div key={provider.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-text-primary">
                      {provider.label}
                    </label>
                    <div className="flex items-center gap-2">
                      {hasSaved && (
                        <span className="text-xs text-emerald px-1.5 py-0.5 rounded bg-emerald/10">
                          Active
                        </span>
                      )}
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-text-muted hover:text-accent transition-colors flex items-center gap-1"
                      >
                        Get key <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mb-2">{provider.description}</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={isVisible ? 'text' : 'password'}
                        placeholder={hasSaved ? savedValue! : provider.placeholder}
                        value={values[provider.key] ?? ''}
                        onChange={(e) => handleChange(provider.key, e.target.value)}
                        className="pr-9 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setVisible((prev) => ({ ...prev, [provider.key]: !isVisible }))
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                      >
                        {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {hasSaved && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => clearKey.mutate(provider.key)}
                        disabled={clearKey.isPending}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-border flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Saving...' : 'Save Keys'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
