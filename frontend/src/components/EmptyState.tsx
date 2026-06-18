import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface EmptyStateProps {
  /** Icon shown above the message. */
  icon: ReactNode;
  /** Whether any filters (search, genre, media type, etc.) are active. */
  hasActiveFilters: boolean;
  /** Current search query (if any), shown in the no-match message. */
  searchQuery?: string;
  /** Called when the user clicks "clear filters". */
  onClearFilters: () => void;
  /** i18n key for the message when filters are active but no results. */
  noMatchKey: string;
  /** i18n key for the subtext when filters are active (e.g. "try a different search term"). */
  noMatchSubtextKey?: string;
  /** i18n key for the message when there is no data at all (no filters). */
  noDataKey: string;
  /** i18n key for the subtext when there is no data. */
  noDataSubtextKey?: string;
  /** Action buttons to show when there is no data (e.g. "Add Movie"). */
  noDataActions?: ReactNode;
}

/**
 * Shared empty state component used by ManageTab and WatchedTab.
 *
 * When `hasActiveFilters` is true, shows a "no matching" message with a
 * "clear filters" button. Otherwise shows a "no data" message with
 * optional action buttons.
 */
export function EmptyState({
  icon,
  hasActiveFilters,
  searchQuery,
  onClearFilters,
  noMatchKey,
  noMatchSubtextKey,
  noDataKey,
  noDataSubtextKey,
  noDataActions,
}: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="empty-state">
      <div className="mb-3 opacity-40">{icon}</div>
      {hasActiveFilters ? (
        <>
          <p className="text-sm font-medium">
            {searchQuery ? t(noMatchKey, { query: searchQuery }) : t(noMatchKey)}
          </p>
          {searchQuery && noMatchSubtextKey && (
            <p className="text-xs mt-1 text-muted-foreground">{t(noMatchSubtextKey)}</p>
          )}
          <button className="btn btn-ghost btn-sm mt-3 gap-1.5" onClick={onClearFilters}>
            <X size={12} />
            {t("watched.clear_filters")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{t(noDataKey)}</p>
          {noDataSubtextKey && (
            <p className="text-xs mt-1 text-muted-foreground">{t(noDataSubtextKey)}</p>
          )}
          {noDataActions && <div className="mt-3">{noDataActions}</div>}
        </>
      )}
    </div>
  );
}
