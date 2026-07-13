# Re-export all CRUD operations from domain-specific submodules.
# Existing code can still `from crud import create_user, save_movies, ...`

from crud.users import (
    create_user,
    authenticate_user,
    get_user_by_id,
    change_password,
    list_users,
    admin_delete_user,
    admin_reset_user_password,
)

from crud.media import (
    delete_all_media_for_user,
    db_delete_media_by_status,
    save_media,
    save_wishlist_items,
    get_media,
    get_media_titles,
    get_media_for_user,
    mark_media_as_watched,
    update_media,
    batch_delete_media,
    enrich_media_metadata,
    set_scrape_error,
    clear_scrape_error,
    get_unenriched_media_ids,
    get_external_poster_media_ids,
    get_enrich_progress,
    delete_media,
    get_media_stats,
    get_top_rated,
    reorder_top_rated,
    add_to_top_rated,
    remove_from_top_rated,
)

from crud.sessions import (
    save_session,
    get_sessions,
    get_session_detail,
    delete_session,
)

from crud.logs import (
    log_operation,
    get_operation_logs,
)

from crud.media_servers import (
    create_media_server,
    get_media_servers,
    get_media_server,
    update_media_server,
    update_last_connected,
    delete_media_server,
)

__all__ = [
    # Users
    "create_user",
    "authenticate_user",
    "get_user_by_id",
    "change_password",
    "list_users",
    "admin_delete_user",
    "admin_reset_user_password",
    # Media
    "delete_all_media_for_user",
    "db_delete_media_by_status",
    "save_media",
    "save_wishlist_items",
    "get_media",
    "get_media_titles",
    "get_media_for_user",
    "mark_media_as_watched",
    "update_media",
    "batch_delete_media",
    "enrich_media_metadata",
    "set_scrape_error",
    "clear_scrape_error",
    "get_unenriched_media_ids",
    "get_external_poster_media_ids",
    "get_enrich_progress",
    "delete_media",
    "get_media_stats",
    "get_top_rated",
    "reorder_top_rated",
    "add_to_top_rated",
    "remove_from_top_rated",
    # Sessions
    "save_session",
    "get_sessions",
    "get_session_detail",
    "delete_session",
    # Logs
    "log_operation",
    "get_operation_logs",
    # Media servers
    "create_media_server",
    "get_media_servers",
    "get_media_server",
    "update_media_server",
    "update_last_connected",
    "delete_media_server",
]
