import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { cn } from '#/lib/utils'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  toast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? XCircle : Info

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)]',
        'bg-surface-3 border shadow-[var(--shadow-card-hover)]',
        'animate-slide-up min-w-[280px] max-w-[400px]',
        toast.type === 'success' && 'border-emerald/30',
        toast.type === 'error' && 'border-rose/30',
        toast.type === 'info' && 'border-border',
      )}
    >
      <Icon
        size={16}
        className={cn(
          'shrink-0',
          toast.type === 'success' && 'text-emerald',
          toast.type === 'error' && 'text-rose',
          toast.type === 'info' && 'text-accent',
        )}
      />
      <p className="text-sm text-text-primary flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      >
        <X size={13} />
      </button>
    </div>
  )
}
