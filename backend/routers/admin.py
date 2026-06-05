"""Admin-only endpoints — data export, API key configuration."""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from auth import require_admin
from config_manager import (
    get_all_status as get_config_status,
    set_api_key as set_config_api_key,
    API_KEY_NAMES,
)
from crud import log_operation

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/export")
async def export_all_data(_admin: dict = Depends(require_admin)):
    """Admin only: export all user data as JSON."""
    from database import get_session
    from models import UserRecord, MediaItemRecord, SessionRecord, RecommendationRecord

    db = get_session()
    try:
        users = db.query(UserRecord).all()
        export = {
            "export_time": datetime.now(timezone.utc).isoformat(),
            "version": "2.0.0",
            "users": [],
        }
        for u in users:
            user_movies = db.query(MediaItemRecord).filter(MediaItemRecord.user_id == u.id).all()
            user_sessions = db.query(SessionRecord).filter(SessionRecord.user_id == u.id).all()

            sessions_data = []
            for s in user_sessions:
                recs = db.query(RecommendationRecord).filter(RecommendationRecord.session_id == s.id).all()
                sessions_data.append({
                    "id": s.id,
                    "model": s.model,
                    "source_count": s.source_count,
                    "created_at": s.created_at.isoformat(),
                    "recommendations": [
                        {
                            "title": r.title,
                            "year": r.year,
                            "genre": r.genre,
                            "reason": r.reason,
                            "confidence": r.confidence,
                        }
                        for r in recs
                    ],
                })

            export["users"].append({
                "id": u.id,
                "username": u.username,
                "is_admin": u.is_admin,
                "created_at": u.created_at.isoformat(),
                "movies": [
                    {
                        "id": m.id,
                        "title": m.title,
                        "rating": m.rating,
                        "year": m.year,
                        "genre": m.genre,
                        "created_at": m.created_at.isoformat(),
                    }
                    for m in user_movies
                ],
                "sessions": sessions_data,
            })

        return StreamingResponse(
            iter([json.dumps(export, ensure_ascii=False, indent=2)]),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="xplora-backup-{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json"',
            },
        )
    finally:
        db.close()


@router.get("/config")
async def get_config(
    _admin: dict = Depends(require_admin),
):
    """Admin only: get current API key configuration status."""
    return {
        "api_keys": get_config_status(),
    }


@router.put("/config")
async def update_config(
    request: dict,
    _admin: dict = Depends(require_admin),
):
    """Admin only: update API key configuration.

    Accepts: { "api_keys": { "deepseek": "...", "openai": "...", "tmdb": "..." } }
    Empty string or null clears the key.
    """
    api_keys = request.get("api_keys", {})
    if not isinstance(api_keys, dict):
        raise HTTPException(status_code=400, detail="Invalid format")

    for key_name in API_KEY_NAMES:
        if key_name in api_keys:
            value = api_keys[key_name]
            set_config_api_key(key_name, value.strip() if value else "")

    log_operation(_admin["id"], _admin["username"], "update_config", f"更新 API Key 配置")
    return {"status": "ok", "api_keys": get_config_status()}
