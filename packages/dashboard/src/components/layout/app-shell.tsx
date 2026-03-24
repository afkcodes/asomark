import { Link, useRouterState } from '@tanstack/react-router'
import {
  LayoutGrid,
  Zap,
  Settings,
} from 'lucide-react'
import { cn } from '#/lib/utils'

const navItems = [
  { to: '/projects', label: 'Projects', icon: LayoutGrid },
  { to: '/strategy', label: 'Strategy', icon: Zap },
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-0">
      <TopNav />
      <main className="max-w-[1440px] mx-auto px-6 py-6">{children}</main>
    </div>
  )
}

function TopNav() {
  const { location } = useRouterState()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-0/80 backdrop-blur-xl">
      <div className="max-w-[1440px] mx-auto px-6 flex items-center h-14 gap-8">
        {/* Logo */}
        <Link to="/projects" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-[#a78bfa] flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            ASOMARK
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'text-text-primary bg-surface-3'
                    : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-2',
                )}
              >
                <item.icon size={15} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-[10px] font-medium text-text-muted tracking-widest uppercase">
            Personal
          </div>
          <Link
            to="/settings"
            className="w-8 h-8 rounded-full bg-surface-3 border border-border flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>
    </header>
  )
}
