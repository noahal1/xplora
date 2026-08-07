"""API endpoints for MoviePilot PT download integration."""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from auth import get_current_user
from deps import get_user_db
from crud.moviepilot import (
    create_mp_connection,
    get_mp_connection,
    update_mp_connection,
    update_mp_last_connected,
    delete_mp_connection,
)
from crud import log_operation
from helpers import iso_utc
from moviepilot.connector import MoviePilotConnector, MoviePilotError

router = APIRouter(prefix="/api/moviepilot", tags=["moviepilot"])


# ── Helper ─────────────────────────────────────────────────────────


def _strip_mp_config(record) -> dict:
    """Convert a DB record to a safe API dict (strip API token from listing)."""
    return {
        "id": record.id,
        "name": record.name,
        "host": record.host,
        "port": record.port,
        "use_ssl": record.use_ssl,
        "is_active": record.is_active,
        "last_connected": iso_utc(record.last_connected, None),
        "created_at": iso_utc(record.created_at),
        "has_api_token": bool(record.api_token),
    }


def _get_connector_from_db(user_id: int, db: Session) -> MoviePilotConnector:
    """Get a MoviePilotConnector from the stored config, or raise 404."""
    record = get_mp_connection(user_id, db=db)
    if not record:
        raise HTTPException(status_code=404, detail="MoviePilot 连接未配置")
    return MoviePilotConnector(
        host=record.host,
        port=record.port,
        api_token=record.api_token,
        use_ssl=record.use_ssl,
    )


# ── Endpoints ──────────────────────────────────────────────────────


@router.get("/config")
async def get_config(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get the current MoviePilot configuration (without API token)."""
    record = get_mp_connection(current_user["id"], db=db)
    if not record:
        return {"configured": False}
    return {"configured": True, **(_strip_mp_config(record))}


@router.post("/config")
async def save_config(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Save MoviePilot connection configuration.

    Accepts::
        {
            "host": "192.168.1.100",
            "port": 3000,
            "api_token": "...",
            "use_ssl": false
        }

    If a config already exists for this user, updates it.
    """
    host = request.get("host", "").strip()
    port = request.get("port", 3000)
    api_token = request.get("api_token", "").strip()
    use_ssl = request.get("use_ssl", False)

    if not host:
        raise HTTPException(status_code=400, detail="请填写 MoviePilot 地址")
    if not api_token:
        raise HTTPException(status_code=400, detail="请填写 API Token")

    # Try host as "host:port" combined field
    if ":" in host and not host.startswith("http"):
        parts = host.split(":", 1)
        host = parts[0].strip()
        try:
            port = int(parts[1].strip())
        except (ValueError, IndexError):
            pass

    record = create_mp_connection(
        user_id=current_user["id"],
        name=request.get("name", "MoviePilot"),
        host=host,
        port=port,
        api_token=api_token,
        use_ssl=use_ssl,
        db=db,
    )

    log_operation(
        current_user["id"], current_user["username"],
        "save_mp_config", f"保存 MoviePilot 配置: {host}:{port}",
        db=db,
    )

    return {"status": "saved", "config": _strip_mp_config(record)}


@router.delete("/config")
async def remove_config(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Delete the MoviePilot connection configuration."""
    deleted = delete_mp_connection(current_user["id"], db=db)
    if not deleted:
        raise HTTPException(status_code=404, detail="MoviePilot 连接未配置")

    log_operation(
        current_user["id"], current_user["username"],
        "delete_mp_config", "删除 MoviePilot 配置",
        db=db,
    )

    return {"status": "deleted"}


@router.post("/test")
async def test_connection(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Test the MoviePilot connection.

    Accepts an optional inline config::

        {
            "host": "192.168.1.100",
            "port": 3000,
            "api_token": "...",
            "use_ssl": false
        }

    If no config is provided, uses the saved config for the current user.
    """
    host = request.get("host", "").strip()
    port = request.get("port", 3000)
    api_token = request.get("api_token", "").strip()
    use_ssl = request.get("use_ssl", False)

    if host and api_token:
        # Test with provided config
        connector = MoviePilotConnector(host, port, api_token, use_ssl)
    else:
        # Test with saved config
        connector = _get_connector_from_db(current_user["id"], db)

    result = await connector.test_connection()
    # Update last_connected only when we know the connection is good
    if result.get("online"):
        update_mp_last_connected(current_user["id"], db=db)
    return result


@router.get("/search")
async def search_torrents(
    q: str = "",
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Search torrents across all PT sites via MoviePilot.

    Query param ``q`` is the search keyword (title + year).

    Returns ``{"results": [...], "error": null}`` on success, or
    ``{"results": [], "error": "..."}`` with a user-friendly message when
    MoviePilot is unreachable / returns an HTTP error — so the frontend can
    distinguish "no torrents found" from "search failed".
    """
    if not q.strip():
        return {"results": [], "error": None}

    connector = _get_connector_from_db(current_user["id"], db)
    try:
        results = await connector.search(q)
        return {"results": results, "error": None}
    except MoviePilotError as e:
        return {"results": [], "error": str(e)}


@router.post("/download")
async def download_torrent(
    request: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Send a torrent to MoviePilot for download.

    Accepts::
        {
            "title": "Inception.2010.2160p.UHD.BluRay.x265",
            "url": "https://pterclub.com/download.php?id=12345",
            "save_path": "/downloads/movies"
        }
    """
    title = request.get("title", "").strip()
    url = request.get("url", "").strip()

    if not title:
        raise HTTPException(status_code=400, detail="请提供种子标题")
    if not url:
        raise HTTPException(status_code=400, detail="请提供下载链接")

    save_path = request.get("save_path", "").strip()

    connector = _get_connector_from_db(current_user["id"], db)
    result = await connector.download(title, url, save_path)

    log_operation(
        current_user["id"], current_user["username"],
        "mp_download",
        f"通过 MoviePilot 下载: {title}",
        db=db,
    )

    return result


@router.get("/torrents")
async def list_torrents(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Get the download queue from MoviePilot."""
    connector = _get_connector_from_db(current_user["id"], db)
    torrents = await connector.get_torrents()
    return {"torrents": torrents}


@router.post("/torrents/{hash_string}/pause")
async def pause_torrent(
    hash_string: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Pause a download task."""
    if not hash_string.strip():
        raise HTTPException(status_code=400, detail="缺少种子 hash")
    connector = _get_connector_from_db(current_user["id"], db)
    result = await connector.pause(hash_string.strip())
    log_operation(
        current_user["id"], current_user["username"],
        "mp_pause", f"暂停下载任务: {hash_string[:12]}",
        db=db,
    )
    return result


@router.post("/torrents/{hash_string}/resume")
async def resume_torrent(
    hash_string: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Resume a paused download task."""
    if not hash_string.strip():
        raise HTTPException(status_code=400, detail="缺少种子 hash")
    connector = _get_connector_from_db(current_user["id"], db)
    result = await connector.resume(hash_string.strip())
    log_operation(
        current_user["id"], current_user["username"],
        "mp_resume", f"继续下载任务: {hash_string[:12]}",
        db=db,
    )
    return result


@router.delete("/torrents/{hash_string}")
async def delete_torrent(
    hash_string: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_user_db),
):
    """Remove a download task (files kept)."""
    if not hash_string.strip():
        raise HTTPException(status_code=400, detail="缺少种子 hash")
    connector = _get_connector_from_db(current_user["id"], db)
    result = await connector.delete(hash_string.strip())
    log_operation(
        current_user["id"], current_user["username"],
        "mp_delete", f"删除下载任务: {hash_string[:12]}",
        db=db,
    )
    return result
