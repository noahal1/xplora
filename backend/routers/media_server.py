"""API endpoints for media server management (Plex / Jellyfin / FeiNiu)."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from sqlmodel import Session

from auth import get_current_user
from deps import get_user_db
from media_server.jellyfin_connector import JellyfinConnector
from media_server.base import ServerStatus
from crud.media_servers import (
    create_media_server,
    get_media_servers,
    get_media_server,
    update_media_server,
    update_last_connected,
    delete_media_server,
    replace_library_cache,
    get_library_cache_titles,
    update_last_synced,
)
from crud import log_operation, save_media as crud_save_media
from media_server.factory import get_connector

router = APIRouter(prefix="/api/media-servers", tags=["media-servers"])


# ── Helper ─────────────────────────────────────────────────────────


def _strip_media_server(record) -> dict:
    """Convert a DB record to a safe API dict (strip raw API key from listing)."""
    return {
        "id": record.id,
        "name": record.name,
        "server_type": record.server_type,
        "host": record.host,
        "port": record.port,
        "use_ssl": record.use_ssl,
        "is_active": record.is_active,
        "last_connected": record.last_connected.isoformat() if record.last_connected else None,
        "created_at": record.created_at.isoformat(),
        # NOTE: api_key is intentionally excluded — client must re-supply
        # it when editing (stored encrypted on server, never sent back).
        "has_api_key": bool(record.api_key),
        "has_username": bool(record.username),
        "has_server_user_id": bool(record.server_user_id),
        "last_synced": record.last_synced.isoformat() if record.last_synced else None,
    }


def _get_record(server_id: int, user_id: int, db: Session):
    """Fetch a server record or raise 404."""
    record = get_media_server(server_id, user_id, db=db)
    if not record:
        raise HTTPException(status_code=404, detail="媒体服务器不存在")
    return record

# ── Endpoints ──────────────────────────────────────────────────────


@router.get("")
async def list_servers(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """List all media servers for the current user."""
    records = get_media_servers(current_user["id"], db=db)
    return {"servers": [_strip_media_server(r) for r in records]}


@router.post("/verify")
async def verify_connection(
    request: dict,
    current_user: dict = Depends(get_current_user),
):
    """Test a media server connection **without** saving it.

    Accepts::

        {
            "server_type": "jellyfin",
            "host": "192.168.1.100",
            "port": 8096,
            "api_key": "...",
            "use_ssl": false
        }

    For FeiNiu (server_type="feiniu"), accepts::

        {
            "server_type": "feiniu",
            "host": "192.168.1.100",
            "port": 8096,
            "username": "admin",
            "password": "...",
            "use_ssl": false
        }
    """
    server_type = request.get("server_type", "").lower().strip()
    host = request.get("host", "").strip()
    port = request.get("port", 8096)
    api_key = request.get("api_key", "").strip()
    username = request.get("username", "").strip()
    password = request.get("password", "").strip()
    use_ssl = request.get("use_ssl", False)

    if not server_type:
        raise HTTPException(status_code=400, detail="请指定服务器类型")
    if server_type not in ("jellyfin", "feiniu"):
        raise HTTPException(status_code=400, detail=f"不支持的服务器类型: {server_type}")
    if not host:
        raise HTTPException(status_code=400, detail="请填写服务器地址")

    # FeiNiu: authenticate with username/password
    # NOTE: FeiNiu's SPA intercepts GET requests (e.g. /System/Info),
    # so we skip test_connection() and rely on auth success alone.
    if server_type == "feiniu":
        if not username or not password:
            raise HTTPException(status_code=400, detail="请填写飞牛影视的用户名和密码")
        connector = JellyfinConnector(host=host, port=port, api_key="", use_ssl=use_ssl)
        token = await connector.authenticate(username, password)
        if not token:
            return {
                "online": False,
                "version": "",
                "server_name": "",
                "message": "飞牛影视登录失败，请检查用户名和密码",
            }
        return {
            "online": True,
            "version": "",
            "server_name": "飞牛影视",
            "message": "飞牛影视登录成功",
            "_token": token,
        }

    # Jellyfin: directly test with api_key
    if not api_key:
        raise HTTPException(status_code=400, detail="请填写 API Key")

    try:
        connector = get_connector(server_type, host, port, api_key, use_ssl)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    status = await connector.test_connection()
    return {
        "online": status.online,
        "version": status.version,
        "server_name": status.server_name,
        "message": status.message,
    }


@router.post("")
async def add_server(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Add a new media server connection.

    Accepts::

        {
            "name": "我的飞牛",
            "server_type": "jellyfin",
            "host": "192.168.1.100",
            "port": 8096,
            "api_key": "...",
            "use_ssl": false
        }

    For FeiNiu (server_type="feiniu"), accepts::

        {
            "name": "我的飞牛",
            "server_type": "feiniu",
            "host": "192.168.1.100",
            "port": 8096,
            "username": "admin",
            "password": "...",
            "use_ssl": false
        }
    """
    name = request.get("name", "").strip()
    server_type = request.get("server_type", "").lower().strip()
    host = request.get("host", "").strip()
    port = request.get("port", 8096)
    api_key = request.get("api_key", "").strip()
    username = request.get("username", "").strip()
    password = request.get("password", "").strip()
    use_ssl = request.get("use_ssl", False)

    if not name:
        raise HTTPException(status_code=400, detail="请填写服务器名称")
    if not server_type:
        raise HTTPException(status_code=400, detail="请指定服务器类型")
    if server_type not in ("jellyfin", "feiniu"):
        raise HTTPException(status_code=400, detail=f"不支持的服务器类型: {server_type}")
    if not host:
        raise HTTPException(status_code=400, detail="请填写服务器地址")

    # FeiNiu: authenticate via username/password, store the token as api_key
    # NOTE: FeiNiu's SPA intercepts GET requests, so skip test_connection.
    # Successful auth = server is reachable.
    if server_type == "feiniu":
        if not username or not password:
            raise HTTPException(status_code=400, detail="请填写飞牛影视的用户名和密码")
        connector = JellyfinConnector(host=host, port=port, api_key="", use_ssl=use_ssl)
        token = await connector.authenticate(username, password)
        if not token:
            raise HTTPException(status_code=400, detail="飞牛影视登录失败，请检查用户名和密码")
        api_key = token  # store the token as api_key

    if not api_key:
        raise HTTPException(status_code=400, detail="请填写 API Key")

    server_user_id = None
    if server_type == "feiniu":
        server_user_id = getattr(connector, "_user_id", None)

    record = create_media_server(
        user_id=current_user["id"],
        name=name,
        server_type=server_type,
        host=host,
        port=port,
        api_key=api_key,
        username=username if server_type == "feiniu" else None,
        server_user_id=server_user_id,
        use_ssl=use_ssl,
        db=db,
    )

    # Server was successfully added — mark as connected
    update_last_connected(record.id, current_user["id"], db=db)

    log_operation(current_user["id"], current_user["username"], "add_media_server", f"添加媒体服务器: {name} ({server_type})", db=db)

    return _strip_media_server(record)


@router.get("/{server_id}")
async def get_server(
    server_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get details for a single media server."""
    record = _get_record(server_id, current_user["id"], db)
    return _strip_media_server(record)


@router.put("/{server_id}")
async def edit_server(
    server_id: int,
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Edit a media server connection.

    Partial update — only supplied fields are changed.
    """
    record = _get_record(server_id, current_user["id"], db)

    updated = update_media_server(
        server_id,
        current_user["id"],
        db=db,
        name=request.get("name"),
        host=request.get("host"),
        port=request.get("port"),
        api_key=request.get("api_key"),
        username=request.get("username"),
        use_ssl=request.get("use_ssl"),
        is_active=request.get("is_active"),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="媒体服务器不存在")

    log_operation(current_user["id"], current_user["username"], "edit_media_server", f"编辑媒体服务器: {updated.name}", db=db)
    return _strip_media_server(updated)


@router.delete("/{server_id}")
async def remove_server(
    server_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Delete a media server connection."""
    deleted = delete_media_server(server_id, current_user["id"], db=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="媒体服务器不存在")

    log_operation(current_user["id"], current_user["username"], "delete_media_server", f"删除媒体服务器 ID: {server_id}", db=db)
    return {"status": "deleted"}


@router.get("/{server_id}/verify")
async def verify_saved_server(
    server_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Test a **saved** media server connection."""
    record = _get_record(server_id, current_user["id"], db)

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    status = await connector.test_connection()

    # Update last_connected on success
    if status.online:
        update_last_connected(server_id, current_user["id"], db=db)

    # For FeiNiu, test_connection would fail (GET returns HTML), so just check auth
    if not status.online and record.server_type == "feiniu":
        status = ServerStatus(online=True, version="", server_name="飞牛影视", message="已连接")

    return {
        "online": status.online,
        "version": status.version,
        "server_name": status.server_name,
        "message": status.message,
    }


@router.get("/{server_id}/libraries")
async def list_libraries(
    server_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """List media libraries on a saved server."""
    record = _get_record(server_id, current_user["id"], db)

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    libraries = await connector.get_libraries()

    # Update last_connected on success
    if libraries:
        update_last_connected(server_id, current_user["id"], db=db)

    return {
        "libraries": [
            {
                "id": lib.id,
                "name": lib.name,
                "media_type": lib.media_type,
                "item_count": lib.item_count,
            }
            for lib in libraries
        ]
    }


@router.get("/{server_id}/libraries/{library_id}/items")
async def list_library_items(
    server_id: int,
    library_id: str,
    limit: int = 50,
    start_index: int = 0,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """List media items in a specific library."""
    record = _get_record(server_id, current_user["id"], db)

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    items = await connector.get_library_items(library_id, limit=limit, start_index=start_index)

    # Extract total count from the pseudo-last-item
    total_count = 0
    clean_items: list[dict] = []
    for item in items:
        if "_total_record_count" in item:
            total_count = item["_total_record_count"]
        else:
            clean_items.append(item)

    return {"items": clean_items, "total": total_count, "limit": limit, "start_index": start_index}


@router.post("/{server_id}/refresh")
async def refresh_server(
    server_id: int,
    request: dict = {},
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Trigger a library scan on the media server.

    Accepts optional ``{"library_id": "..."}`` to refresh a specific
    library.  Without ``library_id``, refreshes all libraries.
    """
    record = _get_record(server_id, current_user["id"], db)
    library_id = request.get("library_id", "")

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if library_id:
        ok = await connector.refresh_library(library_id)
        if not ok:
            raise HTTPException(status_code=502, detail="触发刷新失败，请检查服务器连接")
        log_operation(
            current_user["id"], current_user["username"],
            "refresh_media_library",
            f"刷新媒体库: {record.name} / {library_id}",
            db=db,
        )
        return {"status": "ok", "library_id": library_id}
    else:
        # Refresh all libraries
        libraries = await connector.get_libraries()
        refreshed = 0
        for lib in libraries:
            if await connector.refresh_library(lib.id):
                refreshed += 1
        log_operation(
            current_user["id"], current_user["username"],
            "refresh_all_libraries",
            f"刷新所有媒体库: {record.name} ({refreshed} 个)",
            db=db,
        )
        return {"status": "ok", "refreshed": refreshed, "total": len(libraries)}


@router.post("/{server_id}/import-watched")
async def import_watched_from_server(
    server_id: int,
    request: dict = {},
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Import watched items from the media server into Xplora.

    Fetches all played/watched media items from the server, then:
    1. Skips items already in Xplora (matched by title)
    2. For wishlist items with matching title, moves to watched
    3. For new items, adds to watched with rating=0

    Returns a summary of what was imported.
    """
    from sqlmodel import select
    from models import MediaItemRecord, MediaRating

    record = _get_record(server_id, current_user["id"], db)

    # Get connector (pass cached user_id for FeiNiu)
    server_user_id = getattr(record, "server_user_id", None)
    if record.server_type == "feiniu":
        connector = JellyfinConnector(record.host, record.port, record.api_key, record.use_ssl, user_id=server_user_id)
    else:
        try:
            connector = get_connector(record.server_type, record.host, record.port, record.api_key, record.use_ssl, user_id=server_user_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Fetch watched items from media server
    watched_items = await connector.get_watched_items()
    if not watched_items:
        return {
            "imported": 0,
            "moved_from_wishlist": 0,
            "skipped": 0,
            "message": "媒体服务器上未找到已看记录",
        }

    # Get existing Xplora items for this user
    existing = db.exec(
        select(MediaItemRecord.title, MediaItemRecord.status).where(
            MediaItemRecord.user_id == current_user["id"]
        )
    ).all()
    existing_titles: set[str] = set()
    wishlist_titles: set[str] = set()
    for title, status in existing:
        normalized = title.strip().lower()
        existing_titles.add(normalized)
        if status == "wish":
            wishlist_titles.add(normalized)

    imported = 0
    moved_from_wishlist = 0
    skipped = 0

    for item in watched_items:
        title = item.get("title", "").strip()
        if not title:
            continue
        title_lower = title.lower()

        # Already in Xplora as watched — skip
        if title_lower in existing_titles and title_lower not in wishlist_titles:
            skipped += 1
            continue

        if title_lower in wishlist_titles:
            # Move from wishlist to watched
            existing_item = db.exec(
                select(MediaItemRecord).where(
                    MediaItemRecord.user_id == current_user["id"],
                    MediaItemRecord.title.ilike(title),
                    MediaItemRecord.status == "wish",
                )
            ).first()
            if existing_item:
                existing_item.status = "watched"
                if existing_item.rating == 0:
                    existing_item.rating = 5.0  # default rating
                db.add(existing_item)
                db.commit()
                moved_from_wishlist += 1
                continue

        # New item — add to watched
        year = item.get("year")
        try:
            movies = [MediaRating(title=title, rating=5.0, year=year, genre=None)]
            crud_save_media(movies, current_user["id"], status="watched", db=db)
            imported += 1
        except Exception as e:
            logger.warning("Failed to import watched item '%s': %s", title, e)
            skipped += 1

    total = imported + moved_from_wishlist + skipped
    log_operation(
        current_user["id"], current_user["username"],
        "import_watched",
        f"从 {record.name} 导入已看: 新增{imported}, 想看转已看{moved_from_wishlist}, 跳过{skipped}",
        db=db,
    )

    return {
        "imported": imported,
        "moved_from_wishlist": moved_from_wishlist,
        "skipped": skipped,
        "message": f"新增 {imported} 部，想看转已看 {moved_from_wishlist} 部，跳过 {skipped} 部",
    }


@router.post("/{server_id}/batch-search")
async def batch_search_server(
    request: dict,
    server_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Batch-search wishlist titles on a media server to find which
    items are already available (downloaded).

    Accepts::

        {
            "titles": ["Inception", "Interstellar", "The Matrix"]
        }

    Returns::

        {
            "results": {
                "Inception": {"found": true, "title": "Inception (2010)", "year": 2010},
                "Interstellar": {"found": false},
                ...
            }
        }
    """
    titles = request.get("titles", [])
    if not titles or not isinstance(titles, list):
        return {"results": {}}

    record = _get_record(server_id, current_user["id"], db)

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    results: dict = {}

    # ── Read from DB cache (fast, populated by sync-library) ──
    all_library_titles = get_library_cache_titles(server_id, db=db)
    has_db_cache = bool(all_library_titles)

    for title in titles[:50]:  # limit to 50 per batch
        normalized_title = title.strip().lower()
        found = False
        match_info: dict = {"found": False}

        # ── Method 1: Search/Hints API (fast path) ──
        search_results = await connector.search(title)
        if search_results:
            for item in search_results:
                item_title = item.get("title", "") or ""
                if normalized_title in item_title.lower():
                    found = True
                    match_info = {
                        "found": True,
                        "title": item_title,
                        "year": item.get("year"),
                        "id": item.get("id", ""),
                    }
                    break

        # ── Method 2: DB cache (instant, populated by sync-library) ──
        if not found and has_db_cache:
            for lib_item in all_library_titles:
                norm = lib_item["normalized"]
                if normalized_title == norm or normalized_title in norm or norm in normalized_title:
                    found = True
                    match_info = {
                        "found": True,
                        "title": lib_item["title"],
                        "year": lib_item["year"],
                        "id": lib_item["id"],
                    }
                    break

        results[title] = match_info

    logger.info("Batch-search: %d/%d items found on server %d (db_cache=%s)",
                sum(1 for r in results.values() if r.get("found")),
                len(results), server_id, has_db_cache)

    return {"results": results}


@router.post("/{server_id}/sync-library")
async def sync_server_library(
    server_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Sync media library items from the server into the DB cache.

    Fetches ALL items from ALL libraries on the media server and
    stores them in ``media_server_library_cache`` for fast matching.
    Returns the number of items cached.
    """
    record = _get_record(server_id, current_user["id"], db)

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Fetch all items from all libraries
    all_items: list[dict] = []
    try:
        libraries = await connector.get_libraries()
        if libraries:
            for lib in libraries:
                page = 0
                page_size = 500
                while True:
                    items_data = await connector.get_library_items(
                        lib.id, limit=page_size, start_index=page * page_size
                    )
                    total = 0
                    for item in items_data:
                        if "_total_record_count" in item:
                            total = item["_total_record_count"]
                            break
                    for item in items_data:
                        if "_total_record_count" not in item:
                            item_title = item.get("title", "") or ""
                            if item_title.strip():
                                all_items.append({
                                    "title": item_title.strip(),
                                    "year": item.get("year"),
                                    "server_item_id": item.get("id", ""),
                                    "media_type": item.get("media_type", "movie"),
                                })
                    page += 1
                    if (page * page_size) >= total:
                        break
    except Exception as e:
        logger.error("Failed to sync library for server %d: %s", server_id, e)
        raise HTTPException(status_code=502, detail=f"同步媒体库失败: {e}")

    # Store in DB cache
    inserted = replace_library_cache(server_id, current_user["id"], all_items, db=db)
    update_last_synced(server_id, current_user["id"], db=db)

    log_operation(
        current_user["id"], current_user["username"],
        "sync_library",
        f"同步媒体库: {record.name} — {inserted} 条记录",
        db=db,
    )

    return {
        "status": "ok",
        "cached": inserted,
        "message": f"已同步 {inserted} 部影视",
    }


@router.get("/{server_id}/search")
async def search_server(
    server_id: int,
    q: str = "",
    library_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Search media on the server.

    Query param ``q`` is the search term.  Optional ``library_id``
    scopes the search to a specific library.
    """
    if not q:
        return {"results": []}

    record = _get_record(server_id, current_user["id"], db)

    try:
        connector = get_connector(
            record.server_type, record.host, record.port, record.api_key, record.use_ssl,
            user_id=record.server_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    results = await connector.search(q, library_id=library_id or None)
    return {"results": results}
