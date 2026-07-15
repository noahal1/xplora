"""Factory to instantiate the correct connector for a given server type."""

from .base import BaseConnector
from .jellyfin_connector import JellyfinConnector


def get_connector(
    server_type: str,
    host: str,
    port: int,
    api_key: str,
    use_ssl: bool = False,
    user_id: str | None = None,
) -> BaseConnector:
    """Return the appropriate connector for ``server_type``.

    ``user_id`` is the cached user ID from the media server (used
    for FeiNiu which doesn't expose ``GET /Users``).

    Raises ``ValueError`` for unknown types.
    """
    server_type = server_type.lower().strip()

    if server_type in ("jellyfin", "feiniu"):
        return JellyfinConnector(
            host=host,
            port=port,
            api_key=api_key,
            use_ssl=use_ssl,
            user_id=user_id,
        )

    raise ValueError(f"不支持的服务器类型: {server_type}（仅支持 jellyfin / feiniu）")
