"""API endpoints for media server management (Plex / Jellyfin / FeiNiu)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from auth import get_current_user
from deps import get_user_db
from crud.media_servers import (
    create_media_server,
    get_media_servers,
    get_media_server,
    update_media_server,
    update_last_connected,
    delete_media_server,
)
from crud import log_operation
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
    """
    server_type = request.get("server_type", "").lower().strip()
    host = request.get("host", "").strip()
    port = request.get("port", 8096)
    api_key = request.get("api_key", "").strip()
    use_ssl = request.get("use_ssl", False)

    if not server_type:
        raise HTTPException(status_code=400, detail="请指定服务器类型")
    if not host:
        raise HTTPException(status_code=400, detail="请填写服务器地址")
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
    """
    name = request.get("name", "").strip()
    server_type = request.get("server_type", "").lower().strip()
    host = request.get("host", "").strip()
    port = request.get("port", 8096)
    api_key = request.get("api_key", "").strip()
    use_ssl = request.get("use_ssl", False)

    if not name:
        raise HTTPException(status_code=400, detail="请填写服务器名称")
    if not server_type:
        raise HTTPException(status_code=400, detail="请指定服务器类型")
    if server_type not in ("jellyfin",):
        raise HTTPException(status_code=400, detail=f"不支持的服务器类型: {server_type}")
    if not host:
        raise HTTPException(status_code=400, detail="请填写服务器地址")
    if not api_key:
        raise HTTPException(status_code=400, detail="请填写 API Key")

    record = create_media_server(
        user_id=current_user["id"],
        name=name,
        server_type=server_type,
        host=host,
        port=port,
        api_key=api_key,
        use_ssl=use_ssl,
        db=db,
    )

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
            record.server_type, record.host, record.port, record.api_key, record.use_ssl
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    status = await connector.test_connection()

    # Update last_connected on success
    if status.online:
        update_last_connected(server_id, current_user["id"], db=db)

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
            record.server_type, record.host, record.port, record.api_key, record.use_ssl
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
            record.server_type, record.host, record.port, record.api_key, record.use_ssl
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
            record.server_type, record.host, record.port, record.api_key, record.use_ssl
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    results = await connector.search(q, library_id=library_id or None)
    return {"results": results}
