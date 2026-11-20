"""Test-only portability support: release SQLite before temporary-dir cleanup."""
from pathlib import Path
import asyncio
import tempfile
import weakref

import pytest

from parallax_hedge.store import Store


@pytest.fixture(autouse=True)
def close_test_stores_before_temporary_cleanup(monkeypatch):
    # Upstream tests often leave Store open when TemporaryDirectory exits.
    # POSIX permits unlinking its database; Windows correctly refuses it.
    # Close only test stores inside the directory being removed, without
    # swallowing errors or modifying any business-logic assertion.
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            asyncio.set_event_loop(asyncio.new_event_loop())
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())
    stores = []
    original_init = Store.__init__
    original_cleanup = tempfile.TemporaryDirectory.cleanup

    def tracked_init(self, path):
        original_init(self, path)
        stores.append((Path(path).resolve(), weakref.ref(self)))

    def cleanup(directory):
        root = Path(directory.name).resolve()
        for path, reference in stores:
            store = reference()
            if store is not None and path.is_relative_to(root):
                store.close()
        original_cleanup(directory)

    monkeypatch.setattr(Store, "__init__", tracked_init)
    monkeypatch.setattr(tempfile.TemporaryDirectory, "cleanup", cleanup)
    yield
    for _, reference in stores:
        store = reference()
        if store is not None:
            store.close()
