import argparse
import asyncio
from getpass import getpass

from sqlalchemy import select

from .config import get_settings
from .database import create_database
from .models import Base, User
from .security import normalize_email, password_hash


async def create_user(email: str, name: str) -> None:
    settings = get_settings()
    engine, session_factory = create_database(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    password = getpass("Password: ")
    confirmation = getpass("Confirm password: ")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    normalized = normalize_email(email)
    async with session_factory() as session:
        if await session.scalar(select(User).where(User.email == normalized)):
            raise SystemExit("A user with that email already exists.")
        session.add(
            User(
                email=normalized,
                display_name=name.strip(),
                password_hash=password_hash.hash(password),
            )
        )
        await session.commit()
    await engine.dispose()
    print(f"Created private-beta user {normalized}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage Portego private-beta users")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create = subparsers.add_parser("create", help="Create a login")
    create.add_argument("--email", required=True)
    create.add_argument("--name", default="")
    args = parser.parse_args()
    if args.command == "create":
        asyncio.run(create_user(args.email, args.name))
