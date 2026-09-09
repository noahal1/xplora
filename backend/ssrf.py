"""SSRF protection for user-supplied connection targets.

Media server / MoviePilot endpoints accept a ``host`` + ``port`` from the
client. Without validation, an authenticated (or compromised) account could
point them at internal addresses — loopback services, the cloud metadata
endpoint (``169.254.169.254``), or private subnets — turning the app into an
SSRF proxy used for internal scanning.

Policy:
  * Always blocked: loopback, link-local (which includes cloud metadata),
    multicast, reserved, and unspecified ranges. No media server ever lives
    there.
  * Private LAN ranges (10/8, 172.16/12, 192.168/16, fc00::/7): allowed by
    default, because connecting to LAN media servers IS the product. Set
    ``SSRF_ALLOW_PRIVATE=false`` to block them too for hardened deployments.
  * Hostnames are resolved and EVERY resolved address is checked, which also
    defeats aliasing tricks such as ``169.254.169.254.nip.io``.
"""

import ipaddress
import logging
import os
import re
import socket

logger = logging.getLogger(__name__)

# Ranges that are NEVER legitimate connection targets.
_ALWAYS_BLOCKED = [
    ipaddress.ip_network("0.0.0.0/8"),      # "this network"
    ipaddress.ip_network("127.0.0.0/8"),    # loopback
    ipaddress.ip_network("169.254.0.0/16"), # link-local incl. cloud metadata 169.254.169.254
    ipaddress.ip_network("224.0.0.0/4"),    # multicast
    ipaddress.ip_network("240.0.0.0/4"),    # reserved
    ipaddress.ip_network("::/128"),         # unspecified
    ipaddress.ip_network("::1/128"),        # IPv6 loopback
    ipaddress.ip_network("fe80::/10"),      # IPv6 link-local
    ipaddress.ip_network("::ffff:0:0/96"),  # IPv4-mapped IPv6
    ipaddress.ip_network("ff00::/8"),       # IPv6 multicast
]

# RFC1918 + IPv6 ULA — only blocked when SSRF_ALLOW_PRIVATE=false.
_PRIVATE = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("fc00::/7"),
]

_SCHEME_RE = re.compile(r"^(https?://)", re.IGNORECASE)
_BRACKETED_IPV6_RE = re.compile(r"^\[([^\]]+)\](?::(\d+))?$")


def _allow_private() -> bool:
    return os.getenv("SSRF_ALLOW_PRIVATE", "true").lower() not in ("false", "0", "no")


def _normalize_host(host: str) -> str:
    host = (host or "").strip()
    host = _SCHEME_RE.sub("", host)
    return host.rstrip("/")


def validate_ssrf_target(host: str, port: int) -> None:
    """Validate a user-supplied ``(host, port)`` connection target.

    Raises ``ValueError`` with a user-friendly message when the target is
    malformed or points at a blocked address.
    """
    host = _normalize_host(host)
    if not host:
        raise ValueError("请填写服务器地址")

    try:
        port = int(port)
    except (TypeError, ValueError):
        raise ValueError("端口必须是数字")
    if not (1 <= port <= 65535):
        raise ValueError("端口必须在 1-65535 之间")

    # "host:port" — but a bare IPv6 literal also contains colons
    if ":" in host and not host.startswith("["):
        if host.count(":") == 1:
            bare, _, maybe_port = host.rpartition(":")
            if maybe_port.isdigit():
                host = bare
                port = int(maybe_port)

    # Bracketed IPv6 literal, e.g. "[::1]" or "[::1]:8096"
    if host.startswith("["):
        m = _BRACKETED_IPV6_RE.match(host)
        if not m:
            raise ValueError("地址格式不正确")
        host = m.group(1)
        if m.group(2):
            port = int(m.group(2))

    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        # Hostname — resolve and check every address it may resolve to.
        try:
            infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except socket.gaierror:
            raise ValueError(f"无法解析服务器地址: {host}")
        addresses = [ipaddress.ip_address(info[4][0]) for info in infos]

    for addr in addresses:
        if any(addr in net for net in _ALWAYS_BLOCKED):
            raise ValueError(
                "该地址被禁止访问（回环 / 链路本地 / 云元数据等内网地址）"
            )
        if not _allow_private() and any(addr in net for net in _PRIVATE):
            raise ValueError("已启用 SSRF 防护，禁止连接内网地址")
