'use client';

export function MessageSkeleton() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      <div className="space-y-2 flex-1">
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
        <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/2" />
      </div>
    </div>
  );
}

export function MessageListSkeleton() {
  return (
    <div className="space-y-4 p-6">
      {[...Array(5)].map((_, i) => (
        <MessageSkeleton key={i} />
      ))}
    </div>
  );
}

export function ConversationListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-2/3" />
            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactDetailSkeleton() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        <div className="space-y-2">
          <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-32" />
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-24" />
        </div>
      </div>
      <div className="space-y-3">
        {[85, 72, 96, 78].map((w, i) => (
          <div key={i} className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-48 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
        <div className="h-48 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
      </div>
    </div>
  );
}
