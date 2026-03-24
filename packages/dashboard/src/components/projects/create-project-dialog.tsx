import { useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Globe, Rocket, Radio, X } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Spinner } from '#/components/ui/spinner'
import { cn } from '#/lib/utils'
import { apps as appsApi, projects as projectsApi } from '#/lib/api'

const PLAY_STORE_CATEGORIES = [
  'Art & Design', 'Auto & Vehicles', 'Beauty', 'Books & Reference', 'Business',
  'Comics', 'Communication', 'Dating', 'Education', 'Entertainment',
  'Events', 'Finance', 'Food & Drink', 'Health & Fitness', 'House & Home',
  'Libraries & Demo', 'Lifestyle', 'Maps & Navigation', 'Medical', 'Music & Audio',
  'News & Magazines', 'Parenting', 'Personalization', 'Photography', 'Productivity',
  'Shopping', 'Social', 'Sports', 'Tools', 'Travel & Local',
  'Video Players & Editors', 'Weather',
]

type ProjectMode = 'live' | 'pre_launch'
type Step = 'mode' | 'live_search' | 'pre_launch_details' | 'configure'

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<ProjectMode>('live')

  // Live mode state
  const [packageName, setPackageName] = useState('')

  // Pre-launch state
  const [seedKeywords, setSeedKeywords] = useState<string[]>([])
  const [seedInput, setSeedInput] = useState('')
  const [category, setCategory] = useState('')

  // Shared
  const [projectName, setProjectName] = useState('')
  const [region, setRegion] = useState('us')
  const queryClient = useQueryClient()

  const createProject = useMutation({
    mutationFn: async () => {
      if (mode === 'live') {
        const app = await appsApi.create({
          name: projectName || packageName,
          platform: 'android',
          packageName,
          isOurs: true,
        })
        return projectsApi.create({
          appId: app.id,
          name: projectName || packageName,
          region,
          mode: 'live',
        })
      }
      // Pre-launch: backend auto-creates placeholder app
      return projectsApi.create({
        name: projectName,
        region,
        mode: 'pre_launch',
        seedKeywords,
        category: category || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setOpen(false)
      reset()
    },
  })

  function reset() {
    setStep('mode')
    setMode('live')
    setPackageName('')
    setProjectName('')
    setRegion('us')
    setSeedKeywords([])
    setSeedInput('')
    setCategory('')
  }

  function addSeedKeyword() {
    const kw = seedInput.trim().toLowerCase()
    if (kw && kw.length >= 2 && !seedKeywords.includes(kw)) {
      setSeedKeywords([...seedKeywords, kw])
    }
    setSeedInput('')
  }

  function removeSeedKeyword(kw: string) {
    setSeedKeywords(seedKeywords.filter((k) => k !== kw))
  }

  function handleSeedKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSeedKeyword()
    }
    if (e.key === 'Backspace' && !seedInput && seedKeywords.length > 0) {
      setSeedKeywords(seedKeywords.slice(0, -1))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="md">
          <Plus size={14} />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'mode' && 'Create Project'}
            {step === 'live_search' && 'Live App'}
            {step === 'pre_launch_details' && 'Pre-Launch App'}
            {step === 'configure' && (mode === 'live' ? 'Configure Project' : 'Configure Pre-Launch')}
          </DialogTitle>
          <DialogDescription>
            {step === 'mode' && 'Choose whether your app is already on the Play Store or still in development'}
            {step === 'live_search' && 'Enter your app\'s Google Play package name'}
            {step === 'pre_launch_details' && 'Define your app concept with seed keywords'}
            {step === 'configure' && 'Set project name and region'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Mode Selection */}
        {step === 'mode' && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setMode('live'); setStep('live_search') }}
              className={cn(
                'p-4 rounded-[var(--radius-lg)] border text-left transition-all',
                'hover:border-accent/50 hover:bg-accent/[0.03] cursor-pointer',
                'border-border bg-surface-1',
              )}
            >
              <Radio size={20} className="text-emerald mb-2" />
              <h4 className="text-sm font-semibold text-text-primary">Live App</h4>
              <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                Already on the Play Store. Track rankings, analyze competitors, optimize listing.
              </p>
            </button>
            <button
              onClick={() => { setMode('pre_launch'); setStep('pre_launch_details') }}
              className={cn(
                'p-4 rounded-[var(--radius-lg)] border text-left transition-all',
                'hover:border-accent/50 hover:bg-accent/[0.03] cursor-pointer',
                'border-border bg-surface-1',
              )}
            >
              <Rocket size={20} className="text-accent mb-2" />
              <h4 className="text-sm font-semibold text-text-primary">Pre-Launch</h4>
              <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
                Still in development. Research keywords, plan listing, discover competitors.
              </p>
            </button>
          </div>
        )}

        {/* Step 2a: Live — Package Name */}
        {step === 'live_search' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Package Name
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="com.example.app"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <p className="text-[10px] text-text-muted mt-1.5">
                The package name from Google Play (e.g. com.whatsapp)
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setStep('mode')}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!packageName.includes('.')}
                onClick={() => setStep('configure')}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2b: Pre-Launch — Seed Keywords + Category */}
        {step === 'pre_launch_details' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                App Name
              </label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Awesome App"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Seed Keywords
              </label>
              <div className="min-h-[42px] flex flex-wrap gap-1.5 p-2 bg-surface-1 border border-border rounded-[var(--radius-md)] focus-within:border-accent transition-colors">
                {seedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md"
                  >
                    {kw}
                    <button
                      onClick={() => removeSeedKeyword(kw)}
                      className="hover:text-accent-hover cursor-pointer"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <input
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  onKeyDown={handleSeedKeyDown}
                  onBlur={addSeedKeyword}
                  placeholder={seedKeywords.length === 0 ? 'expense tracker, budget app...' : ''}
                  className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>
              <p className="text-[10px] text-text-muted mt-1.5">
                Keywords people would search to find your app. Press Enter or comma to add.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-surface-1 border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-text-primary appearance-none cursor-pointer hover:border-border-hover focus:border-accent focus:outline-none"
              >
                <option value="">Select category (optional)</option>
                {PLAY_STORE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { setStep('mode'); setProjectName('') }}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!projectName || seedKeywords.length === 0}
                onClick={() => setStep('configure')}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Configure (shared) */}
        {step === 'configure' && (
          <div className="space-y-4">
            {mode === 'live' && (
              <div>
                <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                  Project Name
                </label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={packageName}
                  autoFocus
                />
              </div>
            )}
            {mode === 'pre_launch' && (
              <div className="p-3 bg-surface-1 border border-border rounded-[var(--radius-md)]">
                <p className="text-xs font-medium text-text-secondary mb-1.5">{projectName}</p>
                <div className="flex flex-wrap gap-1">
                  {seedKeywords.map((kw) => (
                    <span key={kw} className="px-1.5 py-0.5 bg-accent/10 text-accent text-[10px] rounded">
                      {kw}
                    </span>
                  ))}
                </div>
                {category && (
                  <p className="text-[10px] text-text-muted mt-1">{category}</p>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Region
              </label>
              <div className="relative">
                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-surface-1 border border-border rounded-[var(--radius-md)] pl-9 pr-3 py-2 text-sm text-text-primary appearance-none cursor-pointer hover:border-border-hover focus:border-accent focus:outline-none"
                >
                  <option value="us">United States</option>
                  <option value="gb">United Kingdom</option>
                  <option value="in">India</option>
                  <option value="de">Germany</option>
                  <option value="jp">Japan</option>
                  <option value="br">Brazil</option>
                  <option value="fr">France</option>
                  <option value="kr">South Korea</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setStep(mode === 'live' ? 'live_search' : 'pre_launch_details')}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => createProject.mutate()}
                disabled={createProject.isPending || (mode === 'live' && !packageName.includes('.'))}
              >
                {createProject.isPending ? <Spinner size={13} /> : null}
                {createProject.isPending ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
            {createProject.isError && (
              <p className="text-xs text-rose text-center">
                {(createProject.error as Error).message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
