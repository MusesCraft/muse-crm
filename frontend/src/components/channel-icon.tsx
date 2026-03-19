'use client';

import { MessageCircle } from 'lucide-react';

const channelConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  messenger: { label: 'Messenger', color: '#0084FF', bgColor: 'bg-[#0084FF]/10' },
  instagram: { label: 'Instagram', color: '#E1306C', bgColor: 'bg-[#E1306C]/10' },
  line: { label: 'LINE', color: '#06C755', bgColor: 'bg-[#06C755]/10' },
};

export function ChannelIcon({ channel, size = 16 }: { channel: string; size?: number }) {
  const config = channelConfig[channel] || { label: channel, color: '#6B7280', bgColor: 'bg-gray-500/10' };

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full ${config.bgColor}`}
      style={{ width: size + 8, height: size + 8 }}
      title={config.label}
    >
      <MessageCircle size={size} style={{ color: config.color }} />
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: string }) {
  const config = channelConfig[channel] || { label: channel, color: '#6B7280', bgColor: 'bg-gray-500/10' };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor}`}
      style={{ color: config.color }}
    >
      <MessageCircle size={12} />
      {config.label}
    </span>
  );
}
