import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '#/lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex gap-1 border-b border-border px-1',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'px-3.5 py-2.5 text-sm font-medium text-text-tertiary',
        'border-b-2 border-transparent -mb-px',
        'transition-colors duration-150 cursor-pointer',
        'hover:text-text-secondary',
        'data-[state=active]:text-text-primary data-[state=active]:border-accent',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: TabsPrimitive.TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={cn('animate-fade-in', className)}
      {...props}
    />
  )
}
