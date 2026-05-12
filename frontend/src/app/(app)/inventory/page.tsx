'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { inventoryApi, type InvProduct, type InvOverview, type InvSizeSpec } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { LoadingSpinner, EmptyState } from '@/components/loading';
import { cn } from '@/lib/utils';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  AlertTriangle,
  Box,
  TrendingDown,
  XCircle,
  ExternalLink,
  Layers,
} from 'lucide-react';

// ── Stock Status ─────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  IN_STOCK:     { label: '有庫存', color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  LOW_STOCK:    { label: '低庫存', color: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' },
  OUT_OF_STOCK: { label: '缺貨',   color: 'text-red-600 dark:text-red-400',       dot: 'bg-red-500' },
};

function StockDot({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.IN_STOCK;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      <span className={cn('text-xs font-medium', c.color)}>{c.label}</span>
    </span>
  );
}

// ── Stock Bar ────────────────────────────────────────

function StockBar({ stock, safety }: { stock: number; safety: number }) {
  const max = Math.max(safety * 3, stock, 1);
  const pct = Math.min((stock / max) * 100, 100);
  const color = stock === 0 ? 'bg-red-500' : stock <= safety ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <span className={cn(
        'text-sm font-semibold tabular-nums w-8 text-right',
        stock === 0 ? 'text-red-600 dark:text-red-400' : stock <= safety ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-100'
      )}>
        {stock}
      </span>
      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Package; label: string; value: number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-start gap-3">
      <div className={cn('p-2.5 rounded-lg', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Stock Distribution Bar ───────────────────────────

function StockDistribution({ overview }: { overview: InvOverview }) {
  const total = overview.totalProducts || 1;
  const segments = [
    { label: '有庫存', count: overview.inStock, color: 'bg-emerald-500', pct: (overview.inStock / total * 100) },
    { label: '低庫存', count: overview.lowStock, color: 'bg-amber-500', pct: (overview.lowStock / total * 100) },
    { label: '缺貨',   count: overview.outOfStock, color: 'bg-red-500', pct: (overview.outOfStock / total * 100) },
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-3">庫存狀態分佈</p>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-3">
        {segments.map((s) => (
          <div key={s.label} className={cn('transition-all', s.color)} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <div className="flex items-center gap-4">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <span className={cn('w-2 h-2 rounded-full', s.color)} />
            {s.label} {s.count}
            <span className="text-zinc-400">({s.pct.toFixed(0)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Status Filter Tabs ───────────────────────────────

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'IN_STOCK', label: '有庫存' },
  { key: 'LOW_STOCK', label: '低庫存' },
  { key: 'OUT_OF_STOCK', label: '缺貨' },
];

// ── Main ─────────────────────────────────────────────

export default function InventoryPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [specFilter, setSpecFilter] = useState('');
  const perPage = 20;
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  const { data: overview } = useAsync<InvOverview>(() => inventoryApi.getOverview(), []);
  const { data: sizeSpecs } = useAsync<InvSizeSpec[]>(() => inventoryApi.getSizeSpecs(), []);

  // 載入所有產品（API 不支援 server-side status/spec filter，前端過濾）
  const { data, loading, error, refetch } = useAsync<{ items: InvProduct[]; total: number }>(
    () => inventoryApi.getProducts({ page, limit: 500, search: search || undefined }),
    [search]
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSearch(value); setPage(1); }, 300);
  };

  // 前端過濾
  const filtered = useMemo(() => {
    let items = data?.items || [];
    if (statusFilter) items = items.filter(p => p.stockStatus === statusFilter);
    if (specFilter) items = items.filter(p => p.sizeSpecId === specFilter);
    return items;
  }, [data?.items, statusFilter, specFilter]);

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / perPage);
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  // 各狀態計數（用於 tab badges）
  const statusCounts = useMemo(() => {
    const items = data?.items || [];
    return {
      '': items.length,
      IN_STOCK: items.filter(p => p.stockStatus === 'IN_STOCK').length,
      LOW_STOCK: items.filter(p => p.stockStatus === 'LOW_STOCK').length,
      OUT_OF_STOCK: items.filter(p => p.stockStatus === 'OUT_OF_STOCK').length,
    };
  }, [data?.items]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">庫存管理</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">繆思精工進銷存系統</p>
        </div>
        <a
          href="https://frontend-production-49b5.up.railway.app/products"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          進銷存系統
        </a>
      </div>

      {/* KPI Row */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard icon={Package} label="總產品" value={overview.totalProducts} color="bg-indigo-500/10 text-indigo-500" />
          <KpiCard icon={Layers} label="總庫存量" value={overview.totalQuantity} sub="片" color="bg-blue-500/10 text-blue-500" />
          <KpiCard icon={Box} label="有庫存" value={overview.inStock} color="bg-emerald-500/10 text-emerald-500" />
          <KpiCard icon={TrendingDown} label="低庫存" value={overview.lowStock} color="bg-amber-500/10 text-amber-500" />
          <KpiCard icon={XCircle} label="缺貨" value={overview.outOfStock} color="bg-red-500/10 text-red-500" />
        </div>
      )}

      {/* Distribution */}
      {overview && <StockDistribution overview={overview} />}

      {/* Filters */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 w-fit">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                statusFilter === tab.key
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              )}
            >
              {tab.label}
              <span className="ml-1 text-[10px] text-zinc-400">{statusCounts[tab.key as keyof typeof statusCounts] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Search + Size Spec */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="搜尋名稱或 SKU..."
              aria-label="搜尋產品"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <select
            value={specFilter}
            onChange={(e) => { setSpecFilter(e.target.value); setPage(1); }}
            aria-label="篩選尺寸規格"
            className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">全部尺寸</option>
            {sizeSpecs?.map(s => (
              <option key={s.id} value={s.id}>{s.label} mm</option>
            ))}
          </select>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
            {totalFiltered} 項
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 rounded-xl overflow-hidden">
        {loading && !data ? (
          <div className="py-16"><LoadingSpinner /></div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-1 font-medium">無法連線進銷存系統</p>
            <p className="text-xs text-zinc-400 mb-4">{error}</p>
            <button onClick={() => refetch()} className="text-sm px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">重試</button>
          </div>
        ) : pageItems.length === 0 ? (
          <EmptyState icon={Package} title="沒有產品" description="目前沒有符合條件的產品" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/80 dark:bg-zinc-800/30">產品</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/80 dark:bg-zinc-800/30">規格</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/80 dark:bg-zinc-800/30">庫存</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/80 dark:bg-zinc-800/30">預留</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider bg-zinc-50/80 dark:bg-zinc-800/30">狀態</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors group">
                    {/* 產品 */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-zinc-400 font-mono">{p.legacySku || p.newSku}</span>
                            {p.variant && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-medium">
                                {p.variant}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* 規格 */}
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-xs text-zinc-600 dark:text-zinc-300">{p.sizeSpec?.label || '\u2014'} mm</p>
                        {p.thickness && (
                          <p className="text-[11px] text-zinc-400">厚 {p.thickness}mm</p>
                        )}
                      </div>
                    </td>
                    {/* 庫存 */}
                    <td className="px-4 py-3">
                      <StockBar stock={p.stock} safety={p.safetyStock} />
                    </td>
                    {/* 預留 */}
                    <td className="px-4 py-3 text-center">
                      {p.reservedStock > 0 ? (
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 tabular-nums">{p.reservedStock}</span>
                      ) : (
                        <span className="text-xs text-zinc-300 dark:text-zinc-700">&mdash;</span>
                      )}
                    </td>
                    {/* 狀態 */}
                    <td className="px-4 py-3 text-center">
                      <StockDot status={p.stockStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              顯示 {(page - 1) * perPage + 1}–{Math.min(page * perPage, totalFiltered)} / 共 {totalFiltered} 項
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
              <span className="text-xs text-zinc-400 px-2 tabular-nums">{page} / {totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
