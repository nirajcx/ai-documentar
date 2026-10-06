"""Restore a supplied pg_dump archive into a disposable Docker PostgreSQL database."""

import argparse
import subprocess
from pathlib import Path
from uuid import uuid4

from sqlalchemy.engine import make_url

from app.core.config import get_settings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--container", default="postgres18")
    args = parser.parse_args()
    url = make_url(get_settings().database_url.get_secret_value())
    name = "documentar_restore_" + uuid4().hex
    prefix = ["docker", "exec", args.container]
    subprocess.run([*prefix, "createdb", "-U", url.username, name], check=True)
    try:
        with args.archive.open("rb") as archive:
            subprocess.run(
                [
                    "docker",
                    "exec",
                    "-i",
                    args.container,
                    "pg_restore",
                    "-U",
                    url.username,
                    "-d",
                    name,
                    "--no-owner",
                    "--exit-on-error",
                ],
                stdin=archive,
                check=True,
            )
        subprocess.run(
            [
                *prefix,
                "psql",
                "-U",
                url.username,
                "-d",
                name,
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                "SELECT version_num FROM alembic_version; SELECT count(*) AS users FROM users;",
            ],
            check=True,
        )
        print("Restore drill passed in a disposable database; application database unchanged.")
    finally:
        subprocess.run([*prefix, "dropdb", "-U", url.username, name], check=True)


if __name__ == "__main__":
    main()
