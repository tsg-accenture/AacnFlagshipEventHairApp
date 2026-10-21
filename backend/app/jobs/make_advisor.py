"""Give an existing account the advisor role (access to /api/v1/admin/*).

Run from backend/:  uv run python -m app.jobs.make_advisor someone@example.com
"""
import sys

from sqlalchemy import select

from app.core.db import session_factory
from app.models import AuditLog, User


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python -m app.jobs.make_advisor EMAIL")
        return 2
    db = session_factory()()
    try:
        u = db.scalars(select(User).where(User.email == argv[1].strip().lower())).first()
        if u is None:
            print("No account with that email. Register in the app first.")
            return 1
        u.role = "advisor"
        db.add(AuditLog(user_id=u.id, action="role_advisor_granted"))
        db.commit()
        print(f"{u.email} is now an advisor.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
