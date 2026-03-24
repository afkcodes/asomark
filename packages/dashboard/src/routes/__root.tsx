import { createRootRoute, Outlet, ScrollRestoration } from '@tanstack/react-router'
import { AppShell } from '#/components/layout/app-shell'
import { TooltipProvider } from '#/components/ui/tooltip'
import { ToastProvider } from '#/components/ui/toast'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <ToastProvider>
      <TooltipProvider delayDuration={300}>
        <AppShell>
          <Outlet />
        </AppShell>
        <ScrollRestoration />
      </TooltipProvider>
    </ToastProvider>
  )
}
