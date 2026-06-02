export function SkeletonRow({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-movie-row">
          <div className="s-block w-4 h-4 shrink-0" />
          <div className="s-block h-4 flex-1" style={{ maxWidth: `${60 + Math.random() * 30}%` }} />
          <div className="s-block w-12 h-4 shrink-0" />
          <div className="s-block w-4 h-4 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative bg-muted/30 border border-border rounded-xl p-4">
          <div className="absolute top-0 left-0 w-0.5 h-full rounded-r-sm shimmer-bg" />
          <div className="flex items-start justify-between mb-2 pl-3 gap-3">
            <div className="skeleton h-5 w-[180px]" />
            <div className="flex items-center gap-2">
              <div className="skeleton h-3.5 w-10" />
              <div className="skeleton h-3.5 w-16 rounded-full" />
              <div className="skeleton h-3.5 w-14 rounded-full" />
            </div>
          </div>
          <div className="pl-3 space-y-1.5">
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/30 border-b border-border">
        <div className="skeleton w-4 h-4 rounded" />
        <div className="skeleton w-10 h-3.5 rounded" />
        <div className="skeleton w-20 h-3.5 rounded" />
        <div className="skeleton w-10 h-3.5 rounded" />
        <div className="skeleton w-10 h-3.5 rounded" />
        <div className="skeleton w-12 h-3.5 rounded" />
        <div className="skeleton w-10 h-3.5 rounded ml-auto" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 border-b border-border">
          <div className="skeleton w-4 h-4 rounded" />
          <div className="skeleton w-10 h-4 rounded" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton w-12 h-4" />
          <div className="skeleton w-10 h-4" />
          <div className="skeleton w-16 h-4" />
          <div className="skeleton w-8 h-4 ml-auto" />
        </div>
      ))}
    </div>
  );
}
