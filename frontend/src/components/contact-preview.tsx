'use client';

import { useState } from 'react';
import { contactsApi, type ContactDetail } from '@/lib/api';
import { Avatar } from '@/components/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Phone, Mail, MessageCircle } from 'lucide-react';

const cache = new Map<string, ContactDetail>();

export function ContactPreview({ contactId, children }: { contactId: string | number; children: React.ReactNode }) {
  const [data, setData] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const statusLabels: Record<string, string> = {
    following_up: '跟進中',
    new: '新客戶',
    quoted: '已報價',
    won: '已成交',
    lost: '已流失',
  };

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !data) {
      const cached = cache.get(String(contactId));
      if (cached) {
        setData(cached);
        return;
      }
      setLoading(true);
      try {
        const res = await contactsApi.getContact(String(contactId));
        cache.set(String(contactId), res);
        setData(res);
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          </div>
        ) : data ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={data.display_name || data.name} url={data.avatar_url} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{data.display_name || data.name || '未知'}</p>
                <p className="text-xs text-zinc-400 capitalize">{data.source_channel || data.channel || ''}</p>
              </div>
            </div>
            {/* 聯絡資訊 */}
            <div className="space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {data.phone && (
                <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{data.phone}</p>
              )}
              {data.email && (
                <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{data.email}</p>
              )}
              {data.contact_status && (
                <p className="flex items-center gap-1.5">
                  <MessageCircle className="w-3 h-3" />
                  {statusLabels[data.contact_status] || data.contact_status}
                </p>
              )}
            </div>
            {/* 客戶身份 + 銷售階段（PR-2） */}
            {(data.customer_identity || data.sales_stage) && (
              <div className="flex flex-wrap gap-1">
                {data.customer_identity && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{data.customer_identity}</span>
                )}
                {data.sales_stage && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">{data.sales_stage}</span>
                )}
              </div>
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
