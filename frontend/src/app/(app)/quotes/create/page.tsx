'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { quotesApi, contactsApi, type Contact } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Search,
} from 'lucide-react';

interface ItemRow {
  key: string;
  description: string;
  dimensions: string;
  unit_price: number;
  quantity: number;
  grade: string;
}

let itemKeyCounter = 0;
function nextItemKey() {
  itemKeyCounter += 1;
  return `item-${itemKeyCounter}`;
}

function newItem(): ItemRow {
  return {
    key: nextItemKey(),
    description: '',
    dimensions: '',
    unit_price: 0,
    quantity: 1,
    grade: '',
  };
}

export default function CreateQuotePage() {
  const router = useRouter();

  // -- Contact search --
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  // -- Form --
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<ItemRow[]>([newItem()]);
  const [discountPct, setDiscountPct] = useState(0);
  const [installationFee, setInstallationFee] = useState(0);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Close contact dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contactDropdownRef.current && !contactDropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Search contacts
  const searchContacts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setContactResults([]);
      return;
    }
    setContactLoading(true);
    try {
      const res = await contactsApi.getContacts({ search: q, per_page: 10 });
      setContactResults(res.data);
    } catch {
      setContactResults([]);
    } finally {
      setContactLoading(false);
    }
  }, []);

  const handleContactSearch = (value: string) => {
    setContactQuery(value);
    setShowContactDropdown(true);
    if (contactDebounce.current) clearTimeout(contactDebounce.current);
    contactDebounce.current = setTimeout(() => {
      searchContacts(value);
    }, 300);
  };

  const selectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setContactQuery(contact.name || contact.display_name || '');
    setShowContactDropdown(false);
  };

  // -- Item helpers --
  const addItem = () => setItems([...items, newItem()]);

  const removeItem = (key: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.key !== key));
  };

  const updateItem = (key: string, field: keyof ItemRow, value: string | number) => {
    setItems(items.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  // -- Calculations --
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const discountAmount = subtotal * (discountPct / 100);
  const total = subtotal - discountAmount + installationFee;

  // -- Submit --
  const handleSubmit = async (sendAfterSave: boolean) => {
    setError('');
    if (!selectedContact) {
      setError('請選擇客戶');
      return;
    }
    if (!title.trim()) {
      setError('請輸入標題');
      return;
    }
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      setError('至少需要一個項目');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        contact_id: selectedContact.id,
        title: title.trim(),
        items: validItems.map((i) => ({
          description: i.description,
          dimensions: i.dimensions || null,
          unit_price: i.unit_price,
          quantity: i.quantity,
          grade: i.grade || null,
        })),
        discount_pct: discountPct,
        installation_fee: installationFee,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        status: sendAfterSave ? 'sent' : 'draft',
      };
      const created = await quotesApi.createQuote(payload);
      router.push(`/quotes/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors';
  const labelClass = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回報價列表
      </Link>

      <h1 className="text-lg font-semibold text-zinc-900 dark:text-white mb-6">新增報價</h1>

      <div className="space-y-6">
        {/* Contact selector */}
        <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">客戶資訊</h2>
          <div className="relative" ref={contactDropdownRef}>
            <label className={labelClass}>客戶 *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                placeholder="搜尋客戶名稱..."
                value={contactQuery}
                onChange={(e) => handleContactSearch(e.target.value)}
                onFocus={() => { if (contactQuery.trim()) setShowContactDropdown(true); }}
                className={cn(inputClass, 'pl-9')}
              />
            </div>
            {showContactDropdown && (contactLoading || contactResults.length > 0) && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {contactLoading ? (
                  <div className="px-3 py-2 text-xs text-zinc-400">搜尋中...</div>
                ) : (
                  contactResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectContact(c)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      {c.name || c.display_name}
                      {c.channel && (
                        <span className="text-xs text-zinc-400 ml-2">{c.channel}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedContact && (
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                已選擇：{selectedContact.name || selectedContact.display_name}
              </p>
            )}
          </div>
        </div>

        {/* Title */}
        <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">報價資訊</h2>
          <div>
            <label className={labelClass}>標題 *</label>
            <input
              type="text"
              placeholder="例：岩板檯面報價"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">報價項目</h2>
            <button
              onClick={addItem}
              className="inline-flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              新增項目
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">描述</th>
                  <th className="text-left px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 w-28">尺寸</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 w-24">單價</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 w-20">數量</th>
                  <th className="text-center px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 w-20">品相</th>
                  <th className="text-right px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 w-24">小計</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const lineTotal = item.unit_price * item.quantity;
                  return (
                    <tr key={item.key} className="border-b border-zinc-100 dark:border-zinc-800/50">
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="項目描述"
                          value={item.description}
                          onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                          className="w-full px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="尺寸"
                          value={item.dimensions}
                          onChange={(e) => updateItem(item.key, 'dimensions', e.target.value)}
                          className="w-full px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e) => updateItem(item.key, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-900 dark:text-zinc-100 text-right focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.key, 'quantity', parseInt(e.target.value, 10) || 1)}
                          className="w-full px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-900 dark:text-zinc-100 text-right focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={item.grade}
                          onChange={(e) => updateItem(item.key, 'grade', e.target.value)}
                          className="w-full px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm text-zinc-600 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">--</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                          ${lineTotal.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => removeItem(item.key)}
                          disabled={items.length <= 1}
                          className="p-1 text-zinc-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing / totals */}
        <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">費用計算</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>折扣 (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discountPct || ''}
                onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>安裝費用</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={installationFee || ''}
                onChange={(e) => setInstallationFee(parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">小計</span>
              <span className="text-zinc-700 dark:text-zinc-200">${subtotal.toLocaleString()}</span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">折扣 ({discountPct}%)</span>
                <span className="text-red-500">-${discountAmount.toLocaleString()}</span>
              </div>
            )}
            {installationFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">安裝費用</span>
                <span className="text-zinc-700 dark:text-zinc-200">${installationFee.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-900 dark:text-white">總計</span>
              <span className="text-indigo-600 dark:text-indigo-400">${total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Valid until + notes */}
        <div className="bg-white border border-zinc-200 shadow-sm dark:bg-zinc-950/50 dark:border-zinc-800 dark:shadow-none rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mb-3">其他資訊</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>有效期限</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelClass}>備註</label>
            <textarea
              rows={3}
              placeholder="報價備註或條款..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClass, 'resize-none')}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/quotes"
            className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            取消
          </Link>
          <button
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-indigo-500 text-indigo-500 dark:text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-500/5 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            儲存草稿
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            儲存並發送
          </button>
        </div>
      </div>
    </div>
  );
}
