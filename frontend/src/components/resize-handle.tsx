'use client';

import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  /** 拖曳方向 */
  direction: 'horizontal' | 'vertical';
  /** 拖曳時回傳 delta（px） */
  onResize: (delta: number) => void;
  className?: string;
}

export function ResizeHandle({ direction, onResize, className }: ResizeHandleProps) {
  const startPos = useRef(0);
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
        const delta = current - startPos.current;
        if (delta !== 0) {
          onResize(delta);
          startPos.current = current;
        }
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'flex-shrink-0 bg-transparent hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors z-10',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:w-1.5'
          : 'h-1 cursor-row-resize hover:h-1.5',
        className
      )}
    />
  );
}
