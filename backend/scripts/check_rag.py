"""Create an isolated database, migrate, test, check schema drift, then drop it."""

import asyncio
import os
import subprocess
import sys
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings


async def main():
    name = "documentar_test_" + uuid4().hex
    url = make_url(get_settings().database_url.get_secret_value())
    admin = create_async_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    test_url = url.set(database=name).render_as_string(hide_password=False)
    env = dict(os.environ, DATABASE_URL=test_url, TEST_DATABASE_URL=test_url)
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'CREATE DATABASE "{name}"'))
        for args in [
            ["-m", "alembic", "upgrade", "head"],
            ["-m", "alembic", "check"],
            ["-m", "pytest", "-q", "--tb=short"],
            ["-m", "alembic", "downgrade", "fd828c47c852"],
            ["-m", "alembic", "upgrade", "head"],
        ]:
            subprocess.run([sys.executable, *args], env=env, check=True)
    finally:
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        await admin.dispose()


if __name__ == "__main__":
    asyncio.run(main())
