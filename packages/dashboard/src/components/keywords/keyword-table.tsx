import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, Search, Eye, EyeOff } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { Badge } from '#/components/ui/badge'
import { DifficultyBar } from './difficulty-bar'
import { RankDeltaBadge } from './rank-delta-badge'
import { TrendIndicator } from './trend-indicator'
import { cn } from '#/lib/utils'
import type { DiscoveredKeyword } from '#/lib/api'

interface KeywordTableProps {
  keywords: DiscoveredKeyword[]
  onToggleTrack?: (keywordId: string) => void
}

export function KeywordTable({ keywords, onToggleTrack }: KeywordTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<DiscoveredKeyword>[]>(
    () => [
      {
        accessorKey: 'keyword',
        header: 'Keyword',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {row.original.keyword}
            </span>
            <SourceBadge source={row.original.source} />
          </div>
        ),
      },
      {
        accessorKey: 'myRank',
        header: 'My Rank',
        cell: ({ row }) => <RankDeltaBadge current={row.original.myRank} />,
        sortingFn: (a, b) => (a.original.myRank ?? 999) - (b.original.myRank ?? 999),
      },
      {
        accessorKey: 'bestCompRank',
        header: 'Best Comp.',
        cell: ({ row }) =>
          row.original.bestCompRank != null ? (
            <div className="flex flex-col gap-0.5" title={row.original.bestCompPackage ?? undefined}>
              <span className="text-sm text-text-secondary tabular-nums">
                #{row.original.bestCompRank}
              </span>
              {row.original.bestCompPackage && (
                <span className="text-[10px] text-text-muted truncate max-w-30">
                  {row.original.bestCompPackage.split('.').pop()}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-text-muted">—</span>
          ),
        sortingFn: (a, b) =>
          (a.original.bestCompRank ?? 999) - (b.original.bestCompRank ?? 999),
      },
      {
        accessorKey: 'difficulty',
        header: 'Difficulty',
        cell: ({ row }) =>
          row.original.difficulty != null ? (
            <DifficultyBar score={row.original.difficulty} />
          ) : (
            <span className="text-[11px] text-text-muted">—</span>
          ),
      },
      {
        accessorKey: 'volume',
        header: 'Volume',
        cell: ({ row }) => (
          <TrendIndicator value={row.original.volume} />
        ),
      },
      {
        accessorKey: 'isTracking',
        header: 'Track',
        cell: ({ row }) => (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleTrack?.(row.original.id)
            }}
            className={cn(
              'p-1 rounded transition-colors cursor-pointer',
              row.original.isTracking
                ? 'text-accent hover:text-accent-hover'
                : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {row.original.isTracking ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        ),
      },
    ],
    [onToggleTrack],
  )

  const table = useReactTable({
    data: keywords,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) =>
      row.original.keyword.toLowerCase().includes(filterValue.toLowerCase()),
  })

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter keywords..."
          className="pl-9 max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="border border-border rounded-[var(--radius-lg)] overflow-hidden">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-surface-1 border-b border-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      'px-4 py-2.5 text-left text-[10px] font-semibold text-text-tertiary uppercase tracking-wider',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-text-secondary',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown size={10} className="text-text-muted" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 last:border-0 hover:bg-surface-1/50 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-text-tertiary"
                >
                  No keywords found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer stats */}
      <div className="flex items-center justify-between mt-3 text-[11px] text-text-tertiary">
        <span>{table.getFilteredRowModel().rows.length} keywords</span>
        <span>
          {keywords.filter((k) => k.isTracking).length} tracking
        </span>
      </div>
    </div>
  )
}

const SOURCE_CONFIG: Record<string, { label: string; variant: 'muted' | 'accent' | 'success' | 'warning' | 'default' }> = {
  autocomplete: { label: 'Autocomplete', variant: 'accent' },
  play_autocomplete: { label: 'Play Store', variant: 'accent' },
  play_alphabet_soup: { label: 'Play Store A-Z', variant: 'success' },
  suggest: { label: 'Google Suggest', variant: 'default' },
  alphabet_soup: { label: 'Google A-Z', variant: 'success' },
  title: { label: 'Title', variant: 'warning' },
  ngram: { label: 'N-gram', variant: 'default' },
  common: { label: 'Common', variant: 'success' },
  description: { label: 'Description', variant: 'muted' },
}

function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source] ?? { label: source, variant: 'muted' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
