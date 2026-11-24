#!/usr/bin/env python3
"""Make a verified daily backup of the website databases and customer files."""
import datetime
import fcntl
import os
from pathlib import Path
import sqlite3
import sys
import tarfile
import tempfile


def snapshot(source, target):
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as live:
        with sqlite3.connect(target) as copy:
            live.backup(copy)
            if copy.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise RuntimeError(f"Invalid backup of {source.name}")


def main():
    media, tracking, destination = (Path(arg).resolve() for arg in sys.argv[1:])
    os.umask(0o077)
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination) as tmp:
        stage = Path(tmp)
        archive = stage / "site.tar.gz"
        # Form submissions and gallery edits take a shared lock for each request.
        with (tracking / "website-storage.lock").open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with tarfile.open(archive, "w:gz") as out:
                for path in (media / "quote-system.sqlite", tracking / "tracking.sqlite", tracking / "neon-shop.sqlite"):
                    snapshot(path, stage / path.name)
                    out.add(stage / path.name, arcname="databases/" + path.name)
                for name in ("uploads", "inquiries"):
                    if (media / name).is_dir():
                        out.add(media / name, arcname="media/" + name)
        # Read every member before replacing this weekday's previous good copy.
        with tarfile.open(archive, "r:gz") as check:
            for member in check:
                if member.isfile():
                    with check.extractfile(member) as contents:
                        while contents.read(1024 * 1024):
                            pass
        target = destination / ("website-" + datetime.date.today().strftime("%a") + ".tar.gz")
        os.replace(archive, target)
        print(target.name)


if __name__ == "__main__":
    main()
