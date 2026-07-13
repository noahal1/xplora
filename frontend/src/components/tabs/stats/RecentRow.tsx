/* ── Recent row ───────────────────────────────────────────────── */
export function RecentRow({ status, title, date }: { status: "watched" | "wish"; title: string; date: string }) {
  const isW = status === "watched";
  return (
    <div className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg transition-all duration-200 cursor-default group">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isW ? "bg-green" : "bg-pink"}`} />
        <span className="text-sm truncate text-foreground">{title}</span>
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
          isW ? "text-green bg-green/10 border border-green/20" : "text-pink bg-pink/10 border border-pink/20"
        }`}>
          {isW ? (
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          )}
          {isW ? "已看" : "想看"}
        </span>
      </div>
      <span className="text-[10px] tabular-nums hidden sm:inline shrink-0 text-fg-dim">{date || ""}</span>
    </div>
  );
}
