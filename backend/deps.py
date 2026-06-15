"""FastAPI dependencies for per-user database access.

Defined in a separate module to avoid circular imports:
  database → auth → crud.users → database.get_session

By putting ``get_user_db`` here, it can import from both ``database``
(already loaded) and ``auth`` (already loaded) without cycles.
"""

from fastapi import Depends
from sqlmodel import Session

from auth import get_current_user
from database import get_user_engine


def get_user_db(current_user: dict = Depends(get_current_user)):
    """FastAPI dependency: get a session to the current user's personal database.

    Automatically resolves the user from JWT and returns a session
    to their dedicated SQLite database file (``data/user_{id}.db``).

    Use in route handlers:

        .. code-block:: python

            @router.get("/items")
            async def list_items(db: Session = Depends(get_user_db)):
                ...
    """
    engine = get_user_engine(current_user["id"])
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()
