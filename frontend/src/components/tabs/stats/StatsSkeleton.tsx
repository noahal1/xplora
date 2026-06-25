/* ── Loading Skeleton ─────────────────────────────────────────── */
export function StatsSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <div className="rounded-2xl p-6 sm:p-8" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
        <div className="space-y-4">
          <div className="skeleton w-24 h-4 rounded" />
          <div className="skeleton w-40 h-12 rounded" />
          <div className="flex gap-3 flex-wrap">
            <div className="skeleton h-7 w-24 rounded-full" />
            <div className="skeleton h-7 w-24 rounded-full" />
            <div className="skeleton h-7 w-20 rounded-full" />
          </div>
        </div>
      </div>
      {/* Chart pair */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
            <div className="space-y-4">
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-full h-[180px] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      {/* Full width chart */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
        <div className="space-y-4">
          <div className="skeleton w-20 h-3 rounded" />
          <div className="skeleton w-full h-[200px] rounded-lg" />
        </div>
      </div>
      {/* Final pair */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)" }}>
            <div className="space-y-4">
              <div className="skeleton w-20 h-3 rounded" />
              <div className="skeleton w-full h-[180px] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
