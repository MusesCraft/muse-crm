'use client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { SlidersHorizontal } from 'lucide-react';

interface Props {
  columns: { key: string; label: string }[];
  visible: Record<string, boolean>;
  onToggle: (key: string) => void;
}

export function ColumnVisibility({ columns, visible, onToggle }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors" aria-label="顯示欄位">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          欄位
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 px-2 py-1 mb-1">顯示欄位</p>
        {columns.map((col) => (
          <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
            <Checkbox
              checked={visible[col.key] !== false}
              onCheckedChange={() => onToggle(col.key)}
            />
            <span className="text-xs text-zinc-700 dark:text-zinc-200">{col.label}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
