"""SSL-configured httpx client factory with connection reuse.

Previously every API call created a new ``httpx.Client`` via ``with make_client()``,
causing a full TLS handshake per request. Now a shared client is reused
across all requests within the same process, leveraging HTTP keep-alive
and connection pooling for dramatically reduced latency.

Environment variables:
  SSL_VERIFY     Set to ``"false"`` to disable SSL certificate
                 verification entirely (⚠️ less secure). Any other
                 value or unset means verify (default).
  SSL_CERT_FILE  Path to a custom CA bundle file (PEM-format). When
                 set, the client uses this file as the trusted CA
                 store instead of the system default.
"""

import logging
import os
import ssl
import threading
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Shared client for connection reuse ─────────────────────────────
# All HTTP calls through get_shared_client() reuse the same connection
# pool, avoiding redundant TLS handshakes.

_shared_client: httpx.Client | None = None
_client_lock = threading.Lock()


def get_shared_client() -> httpx.Client:
    """Return a process-wide shared ``httpx.Client`` with connection
    pooling enabled.

    Thread-safe via double-checked locking: multiple threads calling
    this for the first time (e.g., ``scrape_movie_metadata`` with
    ``ThreadPoolExecutor``) will only create one client — the rest
    see the initialized singleton and return immediately.

    Without the lock, 5 parallel source searches would each create
    their own ``httpx.Client``, leaking connections and splitting
    the pool across unrelated sockets.

    The client is lazily created on first call with TLS settings from
    environment variables (``SSL_VERIFY``, ``SSL_CERT_FILE``). Timeout
    is set per-request by the caller, so a generous default is used.

    Returns the same singleton instance on subsequent calls — all
    connections are pooled and reused via HTTP keep-alive.
    """
    global _shared_client

    # Fast path: already initialized (unlocked, safe because assignment
    # to a single pointer is atomic in CPython for the common case)
    if _shared_client is not None:
        return _shared_client

    with _client_lock:
        # Double-check: another thread may have created the client
        # while we were waiting for the lock
        if _shared_client is not None:
            return _shared_client

        verify: bool | str = _ssl_verify()
        cert_file = _cert_file()

        if not verify:
            logger.warning(
                "SSL verification is DISABLED via SSL_VERIFY env var. "
                "This reduces security — use only as a temporary workaround."
            )
            verify = False
        elif cert_file:
            verify = cert_file

        # Limits: max 20 connections overall, 10 keep-alive connections
        limits = httpx.Limits(max_connections=20, max_keepalive_connections=10)

        _shared_client = httpx.Client(
            timeout=httpx.Timeout(15.0, connect=10.0),
            follow_redirects=True,
            verify=verify,
            limits=limits,
        )

        logger.info(
            "Created shared httpx.Client (SSL verify=%s)%s",
            verify,
            f", CA bundle={cert_file}" if isinstance(verify, str) else "",
        )

    return _shared_client


# ── SSL helpers ────────────────────────────────────────────────────


def _ssl_verify() -> bool | str:
    """Return SSL verification setting based on environment variables.

    - If ``SSL_VERIFY=false`` → return ``False`` (disable verification)
    - If ``SSL_CERT_FILE`` is set → return the path as a string
    - Otherwise → return ``True`` (use system CA bundle)
    """
    if os.environ.get("SSL_VERIFY", "true").lower() == "false":
        return False
    return True


def _cert_file() -> str | None:
    """Return the custom CA bundle path if ``SSL_CERT_FILE`` is set."""
    return os.environ.get("SSL_CERT_FILE") or None


# ── Legacy factory (kept for backward compat) ──────────────────────
# New code should use get_shared_client() instead.

def make_client(
    timeout: float = 10.0,
    follow_redirects: bool = False,
) -> httpx.Client:
    """Create an :class:`httpx.Client` configured via environment variables.

    Prefer :func:`get_shared_client` for connection reuse unless you
    need a client with different timeout/redirect settings.

    Args:
        timeout: Request timeout in seconds (default: 10).
        follow_redirects: Whether to follow HTTP redirects (default: False).

    Returns:
        A configured :class:`httpx.Client` instance.
    """
    verify: bool | str = _ssl_verify()
    cert_file = _cert_file()

    if not verify:
        verify = False
    elif cert_file:
        verify = cert_file

    return httpx.Client(
        timeout=timeout,
        follow_redirects=follow_redirects,
        verify=verify,
    )
