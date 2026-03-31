import { createContext, useContext } from 'react'
import type { ProjectDetail, DiscoveredKeyword } from '#/lib/api'

export interface ProjectContext {
  project: ProjectDetail
  keywords: DiscoveredKeyword[]
  projectId: string
  keywordsFetching: boolean
}

export const ProjectCtx = createContext<ProjectContext | null>(null)

export function useProjectContext(): ProjectContext {
  const ctx = useContext(ProjectCtx)
  if (!ctx) throw new Error('useProjectContext must be used within ProjectCtx.Provider')
  return ctx
}
