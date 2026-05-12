'use client';

import { use, useState, useCallback } from 'react';
import Link from 'next/link';
import { productsApi, type Product, type ProductCategory, type StockLog } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { LoadingSpinner } from '@/components/loading';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Package,
  Edit2,
  Save,
  X,
  Plus,
  Minus,
  History,
  Loader2,
} from 'lucide-react';

// ── 材質標籤 ─────────────────────────────────────────

const materialLabels: Record<string, string> = {
  quartz: '石英石',
  engineered_stone: '人造石',
  sintered_stone: '岩板',
  marble: '大理石',
  granite: '花崗石',
};

// ── 品相 Badge ───────────────────────────────────────

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-sm text-zinc-400 dark:text-zinc-600">&mdash;</span>;
  const config: Record<string, string> = {
    A: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    B: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    C: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    D: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', config[grade] || 'bg-zinc-100 text-zinc-500')}>
      {grade} 級
    </span>
  );
}

// ── 狀態 Badge ───────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    active: { label: '上架中', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
    discontinued: { label: '已停用', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20' },
    out_of_stock: { label: '缺貨', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
  };
  const c = config[status] || config.active;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', c.color)}>
      {c.label}
    </span>
  );
}

// ── 庫存異動原因標籤 ─────────────────────────────────

const reasonLabels: Record<string, { label: string; color: string }> = {
  sale: { label: '銷售', color: 'text-red-600 dark:text-red-400' },
  return: { label: '退貨', color: 'text-blue-600 dark:text-blue-400' },
  damage: { label: '損壞', color: 'text-orange-600 dark:text-orange-400' },
  restock: { label: '進貨', color: 'text-emerald-600 dark:text-emerald-400' },
  adjustment: { label: '調整', color: 'text-zinc-600 dark:text-zinc-400' },
};

// ── 產品資訊區 ───────────────────────────────────────

function ProductInfo({
  product,
  categories,
  onUpdate,
}: {
  product: Product;
  categories: ProductCategory[];
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const fd = new FormData(e.currentTarget);
      await productsApi.updateProduct(product.id, {
        name: fd.get('name') as string,
        sku: (fd.get('sku') as string) || null,
        category_id: (fd.get('category_id') as string) || null,
        material_type: (fd.get('material_type') as string) || null,
        dimensions: (fd.get('dimensions') as string) || null,
        unit_price: (fd.get('unit_price') as string) ? Number(fd.get('unit_price')) : null,
        grade: (fd.get('grade') as string) || null,
        status: (fd.get('status') as string) || 'active',
        notes: (fd.get('notes') as string) || null,
      } as Partial<Product>);
      setEditing(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-indigo-400" />
            編輯產品
          </h2>
          <button onClick={() => setEditing(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSave} className="grid gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">產品名稱 *</label>
            <input name="name" defaultValue={product.name} required className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">SKU</label>
              <input name="sku" defaultValue={product.sku || ''} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">分類</label>
              <select name="category_id" defaultValue={product.category_id || ''} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                <option value="">請選擇</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">材質</label>
              <select name="material_type" defaultValue={product.material_type || ''} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                <option value="">請選擇</option>
                <option value="quartz">石英石</option>
                <option value="engineered_stone">人造石</option>
                <option value="sintered_stone">岩板</option>
                <option value="marble">大理石</option>
                <option value="granite">花崗石</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">尺寸</label>
              <input name="dimensions" defaultValue={product.dimensions || ''} placeholder="如 3200x1600x20mm" className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">品相</label>
              <select name="grade" defaultValue={product.grade || ''} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                <option value="">請選擇</option>
                <option value="A">A 級</option>
                <option value="B">B 級</option>
                <option value="C">C 級</option>
                <option value="D">D 級</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">單價</label>
              <input name="unit_price" type="number" min="0" step="0.01" defaultValue={product.unit_price ?? ''} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">狀態</label>
              <select name="status" defaultValue={product.status} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                <option value="active">上架中</option>
                <option value="discontinued">已停用</option>
                <option value="out_of_stock">缺貨</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">備註</label>
            <textarea name="notes" rows={2} defaultValue={product.notes || ''} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">取消</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              儲存
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{product.name}</h1>
            {product.sku && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">SKU: {product.sku}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/5 transition-colors"
        >
          <Edit2 className="w-3 h-3" />
          編輯
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <StatusBadge status={product.status} />
        <GradeBadge grade={product.grade} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">分類</span>
          <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">{product.category_name || '\u2014'}</p>
        </div>
        <div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">材質</span>
          <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">
            {product.material_type ? (materialLabels[product.material_type] || product.material_type) : '\u2014'}
          </p>
        </div>
        <div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">尺寸</span>
          <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">{product.dimensions || '\u2014'}</p>
        </div>
        <div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">單價</span>
          <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">
            {product.unit_price != null ? `$${product.unit_price.toLocaleString()}` : '\u2014'}
          </p>
        </div>
        <div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">庫存數量</span>
          <p className={cn('font-semibold mt-0.5', product.stock_quantity === 0 ? 'text-red-600 dark:text-red-400' : product.stock_quantity < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
            {product.stock_quantity}
          </p>
        </div>
        <div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">建立時間</span>
          <p className="text-zinc-700 dark:text-zinc-200 mt-0.5">{formatDateTime(product.created_at)}</p>
        </div>
      </div>

      {product.notes && (
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">備註</span>
          <p className="text-sm text-zinc-700 dark:text-zinc-200 mt-1 whitespace-pre-wrap">{product.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── 庫存異動表單 ─────────────────────────────────────

function StockAdjustment({ productId, onUpdate }: { productId: string; onUpdate: () => void }) {
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'add' | 'subtract'>('add');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setAdjusting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const qty = parseInt(fd.get('quantity') as string, 10);
      if (!qty || qty <= 0) {
        setError('數量必須大於 0');
        setAdjusting(false);
        return;
      }
      const quantityChange = mode === 'subtract' ? -qty : qty;
      await productsApi.adjustStock(productId, {
        quantity_change: quantityChange,
        reason: fd.get('reason') as string,
        note: (fd.get('note') as string) || undefined,
      });
      (e.target as HTMLFormElement).reset();
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : '異動失敗');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <Package className="w-4 h-4 text-indigo-400" />
        庫存異動
      </h3>
      <form onSubmit={handleSubmit} className="grid gap-3">
        {/* 入庫/出庫 切換 */}
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors',
              mode === 'add'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            入庫
          </button>
          <button
            type="button"
            onClick={() => setMode('subtract')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors',
              mode === 'subtract'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
            )}
          >
            <Minus className="w-3.5 h-3.5" />
            出庫
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">數量 *</label>
            <input name="quantity" type="number" min="1" required className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">原因 *</label>
            <select name="reason" required className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
              {mode === 'add' ? (
                <>
                  <option value="restock">進貨</option>
                  <option value="return">退貨</option>
                  <option value="adjustment">調整</option>
                </>
              ) : (
                <>
                  <option value="sale">銷售</option>
                  <option value="damage">損壞</option>
                  <option value="adjustment">調整</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">備註</label>
          <textarea name="note" rows={2} placeholder="選填，如客戶名稱或單號..." className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 resize-none" />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={adjusting}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
            mode === 'add'
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-red-500 text-white hover:bg-red-600'
          )}
        >
          {adjusting && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'add' ? '確認入庫' : '確認出庫'}
        </button>
      </form>
    </div>
  );
}

// ── 庫存異動歷史 ─────────────────────────────────────

function StockHistory({ logs }: { logs: StockLog[] }) {
  return (
    <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-amber-400" />
        異動紀錄
        <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">({logs.length})</span>
      </h3>

      {logs.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">尚無異動紀錄</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const r = reasonLabels[log.reason] || { label: log.reason, color: 'text-zinc-600 dark:text-zinc-400' };
            const isPositive = log.quantity_change > 0;
            return (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/30"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                    isPositive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  )}>
                    {isPositive ? '+' : ''}{log.quantity_change}
                  </div>
                  <div>
                    <span className={cn('text-xs font-medium', r.color)}>{r.label}</span>
                    {log.reference_note && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{log.reference_note}</p>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{formatDateTime(log.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: product, loading, error, refetch } = useAsync<Product & { stock_logs: StockLog[] }>(
    () => productsApi.getProduct(id),
    [id]
  );

  const { data: categories } = useAsync<ProductCategory[]>(
    () => productsApi.getCategories(),
    []
  );

  const handleUpdate = useCallback(() => {
    refetch();
  }, [refetch]);

  if (loading) return <LoadingSpinner className="min-h-screen" />;
  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!product) return null;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back button */}
      <Link
        href="/inventory"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回庫存列表
      </Link>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Product info (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <ProductInfo product={product} categories={categories || []} onUpdate={handleUpdate} />
          <StockHistory logs={product.stock_logs} />
        </div>

        {/* Right: Stock adjustment (1 col) */}
        <div className="space-y-4">
          <StockAdjustment productId={id} onUpdate={handleUpdate} />
        </div>
      </div>
    </div>
  );
}
