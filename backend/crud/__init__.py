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

from crud.movies import (
    delete_all_movies_for_user,
    db_delete_movies_by_status,
    save_movies,
    save_wishlist_items,
    get_movies,
    get_movie_titles,
    get_movie_for_user,
    mark_movie_as_watched,
    update_movie,
    batch_delete_movies,
    enrich_movie_metadata,
    set_scrape_error,
    clear_scrape_error,
    get_unenriched_movie_ids,
    get_external_poster_movie_ids,
    get_enrich_progress,
    delete_movie,
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

__all__ = [
    # Users
    "create_user",
    "authenticate_user",
    "get_user_by_id",
    "change_password",
    "list_users",
    "admin_delete_user",
    "admin_reset_user_password",
    # Movies
    "delete_all_movies_for_user",
    "db_delete_movies_by_status",
    "save_movies",
    "save_wishlist_items",
    "get_movies",
    "get_movie_titles",
    "get_movie_for_user",
    "mark_movie_as_watched",
    "update_movie",
    "batch_delete_movies",
    "enrich_movie_metadata",
    "set_scrape_error",
    "clear_scrape_error",
    "get_unenriched_movie_ids",
    "get_external_poster_movie_ids",
    "get_enrich_progress",
    "delete_movie",
    # Sessions
    "save_session",
    "get_sessions",
    "get_session_detail",
    "delete_session",
    # Logs
    "log_operation",
    "get_operation_logs",
]
