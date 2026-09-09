"""Encryption helpers for secrets stored at rest.

Media server API keys and MoviePilot tokens are encrypted with Fernet
(AES-128-CBC + HMAC-SHA256) before being written to the database. The key is
derived from the JWT signing secret (``auth.JWT_SECRET``), which is either
explicitly configured or auto-generated and persisted to ``data/jwt_secret``,
so already-stored rows stay decryptable across restarts.

Stored values carry the ``enc:v1:`` prefix so encrypted values can be told
apart from legacy plaintext rows. ``decrypt_secret`` transparently returns
legacy plaintext as-is — old rows keep working and are upgraded to encrypted
form by a startup migration (see ``database._encrypt_existing_secrets``).
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_PREFIX = "enc:v1:"

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Build (once) a Fernet instance keyed off the JWT secret."""
    global _fernet
    if _fernet is None:
        # Imported lazily to avoid a circular import (auth -> crud -> models).
        from auth import JWT_SECRET

        key = base64.urlsafe_b64encode(hashlib.sha256(JWT_SECRET.encode()).digest())
        _fernet = Fernet(key)
    return _fernet


def is_encrypted(stored: str) -> bool:
    """Return True if ``stored`` looks like an encrypted value."""
    return bool(stored) and stored.startswith(_PREFIX)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt ``plaintext`` for storage. Empty input stays empty."""
    if not plaintext:
        return ""
    # Idempotency guard: never double-encrypt an already-encrypted value.
    if is_encrypted(plaintext):
        return plaintext
    token = _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
    return _PREFIX + token


def decrypt_secret(stored: str) -> str:
    """Decrypt a stored secret.

    Legacy plaintext values (no ``enc:v1:`` prefix) are returned unchanged
    so old rows keep working; they are migrated to encrypted form on the
    next startup / save.
    """
    if not stored:
        return ""
    if not is_encrypted(stored):
        return stored
    try:
        return _get_fernet().decrypt(stored[len(_PREFIX):].encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning(
            "Could not decrypt a stored secret (key changed?) — returning it as-is"
        )
        return stored
