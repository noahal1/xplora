import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import SplitText from "./SplitText";

interface EmptyStateProps {
  /** Icon shown above the message. Optional — omitted for inline states. */
  icon?: ReactNode;
  /** Whether any filters (search, genre, media type, etc.) are active. */
  hasActiveFilters?: boolean;
  /** Current search query (if any), shown in the no-match message. */
  searchQuery?: string;
  /** Called when the user clicks "clear filters". */
  onClearFilters?: () => void;
  /** i18n key for the message when filters are active but no results. */
  noMatchKey?: string;
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
 * Shared empty state component used across all tabs.
 *
 * When `hasActiveFilters` is true, shows a "no matching" message with a
 * "clear filters" button. Otherwise shows a "no data" message with
 * optional action buttons.
 */
export function EmptyState({
  icon,
  hasActiveFilters = false,
  searchQuery,
  onClearFilters,
  noMatchKey = "",
  noMatchSubtextKey,
  noDataKey,
  noDataSubtextKey,
  noDataActions,
}: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="empty-state animate-slide-down" key={hasActiveFilters ? 'filter' : 'nodata'}>
      {icon && (
        <div className="mb-3 opacity-40 animate-scale-in" style={{ animationDelay: '0ms' }}>
          {icon}
        </div>
      )}
      {hasActiveFilters ? (
        <>
          <SplitText
            text={searchQuery ? t(noMatchKey, { query: searchQuery }) : t(noMatchKey)}
            tag="p"
            className="text-sm font-medium"
            splitType="words"
            delay={40}
            duration={0.5}
            threshold={0}
            rootMargin="0px"
            textAlign="center"
            from={{ opacity: 0, y: 10 }}
            to={{ opacity: 1, y: 0 }}
          />
          {searchQuery && noMatchSubtextKey && (
            <SplitText
              text={t(noMatchSubtextKey)}
              tag="p"
              className="text-xs mt-1 text-muted-foreground"
              splitType="words"
              delay={30}
              duration={0.4}
              threshold={0}
              rootMargin="0px"
              textAlign="center"
              from={{ opacity: 0, y: 8 }}
              to={{ opacity: 1, y: 0 }}
            />
          )}
          {onClearFilters && (
            <button
              className="btn btn-ghost btn-sm mt-3 gap-1.5 animate-fade-in"
              style={{ animationDelay: '150ms' }}
              onClick={onClearFilters}
            >
              <X size={12} />
              {t("watched.clear_filters")}
            </button>
          )}
        </>
      ) : (
        <>
          <SplitText
            text={t(noDataKey)}
            tag="p"
            className="text-sm font-medium"
            splitType="words"
            delay={40}
            duration={0.5}
            threshold={0}
            rootMargin="0px"
            textAlign="center"
            from={{ opacity: 0, y: 10 }}
            to={{ opacity: 1, y: 0 }}
          />
          {noDataSubtextKey && (
            <SplitText
              text={t(noDataSubtextKey)}
              tag="p"
              className="text-xs mt-1 text-muted-foreground"
              splitType="words"
              delay={30}
              duration={0.4}
              threshold={0}
              rootMargin="0px"
              textAlign="center"
              from={{ opacity: 0, y: 8 }}
              to={{ opacity: 1, y: 0 }}
            />
          )}
          {noDataActions && (
            <div className="mt-3 animate-fade-in" style={{ animationDelay: '150ms' }}>
              {noDataActions}
            </div>
          )}
        </>
      )}
    </div>
  );
}
