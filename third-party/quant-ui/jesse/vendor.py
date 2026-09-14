"""Reproduce the genuine Jesse v3.1.1 dashboard import from its pinned source archive.

Usage: python vendor.py /path/to/jesse-source.tar.gz
This imports the original release assets; it does not rebuild unavailable Nuxt sources.
"""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile


COMMIT = "44a0ed432fd74133edaf273f3b56100042f564b3"
ARCHIVE_SHA256 = "d0c94c93667e6442db11acb938cd3b978baf20769f613b4843bbbc235dc72286"
ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / "public" / "quant-native" / "jesse"
HERE = Path(__file__).resolve().parent


def import_assets(archive: Path) -> None:
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("Upstream archive does not match the audited v3.1.1 commit.")
    prefix = f"jesse-{COMMIT}/"
    asset_prefix = prefix + "jesse/static/"
    files: list[dict] = []
    DEST.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as source, tarfile.open(HERE / "upstream-ui.tar.gz", "w:gz") as snapshot:
        for member in source.getmembers():
            if not member.isfile():
                continue
            if member.name == prefix + "LICENSE":
                license_bytes = source.extractfile(member).read()
                (HERE / "LICENSE").write_bytes(license_bytes)
                (DEST / "LICENSE").write_bytes(license_bytes)
                info = tarfile.TarInfo("LICENSE")
                info.size = len(license_bytes)
                snapshot.addfile(info, io.BytesIO(license_bytes))
            if not member.name.startswith(asset_prefix):
                continue
            relative = PurePosixPath(member.name[len(asset_prefix):])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Unsafe upstream asset path.")
            data = source.extractfile(member).read()
            target = DEST.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            info = tarfile.TarInfo("static/" + str(relative))
            info.size = len(data)
            snapshot.addfile(info, io.BytesIO(data))
            files.append({"path": str(relative), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    manifest = {
        "project": "Jesse", "version": "3.1.1", "commit": COMMIT,
        "source": f"https://github.com/jesse-ai/jesse/tree/{COMMIT}/jesse/static",
        "archive": f"https://codeload.github.com/jesse-ai/jesse/tar.gz/{COMMIT}",
        "archiveSha256": ARCHIVE_SHA256, "license": "MIT", "retrievedAt": "2026-09-07",
        "kind": "Official compiled Nuxt dashboard distributed in the pinned source release",
        "sourceBuildAvailable": False,
        "legacySourceNote": "jesse-ai/dashboard is the archived older Vue CLI frontend, not this Nuxt build.",
        "files": files,
    }
    (HERE / "UPSTREAM.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(files)} original assets, {sum(item['size'] for item in files)} bytes.")


if __name__ == "__main__":
    import_assets(Path(sys.argv[1]))
