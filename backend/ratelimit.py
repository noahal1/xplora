"""In-memory rate limiting for the login endpoint.

Mitigates brute-force / credential-stuffing attacks by tracking failed
login attempts per client IP inside a sliding window. Once the limit is
exceeded, further attempts are rejected with HTTP 429 until the window
rolls over.

Notes:
  * In-memory only — suitable for the single-process uvicorn deployment
    this project uses. For multi-worker / multi-instance setups, swap
    this for a shared store (Redis etc.).
  * Only *failed* attempts count, and a successful login resets the
    counter, so legitimate users on shared NATs are not locked out by
    someone else's mistakes.
  * When deployed behind a reverse proxy (see nginx.conf), the client IP
    is taken from the left-most ``X-Forwarded-For`` entry, which nginx
    sets to the real client address.
"""

import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_WINDOW_SECONDS = 60


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip())
    except (TypeError, ValueError):
        return default


class LoginRateLimiter:
    """Fixed-window failed-attempt limiter keyed by client IP."""

    def __init__(
        self,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        window_seconds: int = DEFAULT_WINDOW_SECONDS,
    ):
        self.max_attempts = max(1, max_attempts)
        self.window_seconds = max(1, window_seconds)
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int]:
        """Return ``(allowed, retry_after_seconds)`` for a new attempt.

        ``retry_after`` is 0 when the attempt is allowed.
        """
        now = time.monotonic()
        with self._lock:
            stamps = [
                t for t in self._failures.get(key, [])
                if now - t < self.window_seconds
            ]
            if len(stamps) >= self.max_attempts:
                self._failures[key] = stamps
                retry_after = int(self.window_seconds - (now - stamps[0])) + 1
                return False, max(retry_after, 1)
            self._failures[key] = stamps
            # Opportunistic cleanup so abandoned keys don't grow forever
            if len(self._failures) > 10_000:
                self._failures = {
                    k: v for k, v in self._failures.items() if v
                }
            return True, 0

    def record_failure(self, key: str) -> None:
        """Record a failed attempt for ``key``."""
        with self._lock:
            self._failures.setdefault(key, []).append(time.monotonic())

    def reset(self, key: str) -> None:
        """Clear all recorded failures for ``key`` (e.g. after a success)."""
        with self._lock:
            self._failures.pop(key, None)


def client_ip(request) -> str:
    """Best-effort client IP, honouring the proxy headers set by nginx.conf."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"


login_rate_limiter = LoginRateLimiter(
    max_attempts=_env_int("LOGIN_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS),
    window_seconds=_env_int("LOGIN_RATE_LIMIT_WINDOW", DEFAULT_WINDOW_SECONDS),
)
