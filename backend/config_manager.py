"""Centralized API key configuration manager.

Reads keys from config.json (persistent, writable from frontend),
then falls back to environment variables (from .env or system env).
Priority: config.json > environment variable.
"""

import os
import json

# Config file path for API keys configured via the frontend UI.
# In Docker, override via XPLORA_CONFIG_FILE=/app/data/config.json
# to persist keys across container updates (/app/data is a volume).
# Locally, defaults to backend/config.json (same dir as this file).
CONFIG_FILE = os.getenv(
    "XPLORA_CONFIG_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json"),
)

# All configurable API keys: short name -> env var name
API_KEY_NAMES: dict[str, str] = {
    "deepseek": "DEEPSEEK_API_KEY",
    "openai": "OPENAI_API_KEY",
    "tmdb": "TMDB_API_KEY",
}

_config_cache: dict | None = None


def _load_config() -> dict:
    """Load config from JSON file (cached)."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                _config_cache = json.load(f)
        except (json.JSONDecodeError, IOError):
            _config_cache = {}
    else:
        _config_cache = {}
    return _config_cache


def _save_config(config: dict) -> None:
    """Save config to JSON file and update cache."""
    global _config_cache
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    _config_cache = config


def get_api_key(key_name: str) -> str:
    """Get API key by short name.
    Priority: config.json > environment variable.
    Returns empty string if not found.
    """
    config = _load_config()
    env_var = API_KEY_NAMES.get(key_name)
    if not env_var:
        return ""
    # Check config.json first (persistent UI-configured value)
    if key_name in config and config[key_name]:
        return str(config[key_name])
    # Fall back to env var (from .env or system)
    return os.getenv(env_var, "")


def set_api_key(key_name: str, value: str) -> None:
    """Set or clear an API key in config.json.
    Also updates os.environ so the current process picks it up immediately.
    """
    if key_name not in API_KEY_NAMES:
        raise ValueError(f"Unknown API key: {key_name}")

    config = _load_config()
    config[key_name] = value
    _save_config(config)

    # Sync to os.environ so current process sees it without restart
    env_var = API_KEY_NAMES[key_name]
    if value:
        os.environ[env_var] = value
    elif env_var in os.environ:
        del os.environ[env_var]


def get_all_status() -> dict[str, bool]:
    """Get configuration status for all API keys.
    Returns dict with key_name -> bool (True if configured).
    """
    config = _load_config()
    status = {}
    for key_name, env_var in API_KEY_NAMES.items():
        from_file = bool(config.get(key_name))
        from_env = bool(os.getenv(env_var, ""))
        status[key_name] = from_file or from_env
    return status


def reload() -> None:
    """Force reload config from disk (clears cache)."""
    global _config_cache
    _config_cache = None


