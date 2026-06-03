"""SSL-configured httpx client factory.

Controls SSL verification behaviour via environment variables so that
users behind problematic TLS configurations (e.g. certain Windows
networks, corporate proxies) can work around SSL errors without
modifying code.

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
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _ssl_verify() -> bool:
    """Return whether SSL verification is enabled (default: True)."""
    return os.environ.get("SSL_VERIFY", "true").strip().lower() not in (
        "false", "0", "no",
    )


def _cert_file() -> Optional[str]:
    """Return custom CA bundle path from env, or None."""
    path = os.environ.get("SSL_CERT_FILE") or os.environ.get("SSL_CA_BUNDLE")
    if path and os.path.isfile(path):
        return path
    return None


def make_client(
    timeout: float = 10.0,
    follow_redirects: bool = False,
) -> httpx.Client:
    """Create an :class:`httpx.Client` configured via environment variables.

    Args:
        timeout: Request timeout in seconds (default: 10).
        follow_redirects: Whether to follow HTTP redirects (default: False).

    Returns:
        A configured :class:`httpx.Client` instance.
    """
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

    return httpx.Client(
        timeout=timeout,
        follow_redirects=follow_redirects,
        verify=verify,
    )
