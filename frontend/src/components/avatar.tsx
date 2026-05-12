'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string | null | undefined;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
};

const colors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-pink-500',
  'bg-indigo-500',
];

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name: rawName, url, size = 'md', className }: AvatarProps) {
  const name = rawName || 'Unknown';

  if (url) {
    const px = size === 'sm' ? 32 : size === 'md' ? 40 : 56;
    return (
      <Image
        src={url}
        alt={name}
        width={px}
        height={px}
        className={cn('rounded-full object-cover flex-shrink-0', sizeMap[size], className)}
        unoptimized
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-medium flex-shrink-0',
        sizeMap[size],
        getColor(name),
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
