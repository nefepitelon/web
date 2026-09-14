"""Apply narrow, audited hosting patches to the official compiled Jesse UI."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[2] / "public" / "quant-native" / "jesse"
manifest = json.loads((HERE / "UPSTREAM.json").read_text(encoding="utf-8"))
originals = {item["path"]: item for item in manifest["files"]}
patches = []


def change(relative: str, edits: list[tuple[str, str]], description: str) -> None:
    target = PUBLIC / relative
    before = target.read_bytes()
    expected = originals[relative]["sha256"]
    if hashlib.sha256(before).hexdigest() != expected:
        raise ValueError(f"{relative}: input differs from pristine pinned upstream; rerun vendor.py first.")
    content = before.decode("utf-8")
    for source, replacement in edits:
        if content.count(source) != 1:
            raise ValueError(f"{relative}: expected exactly one hosting patch anchor: {source[:80]}")
        content = content.replace(source, replacement, 1)
    target.write_bytes(content.encode("utf-8"))
    patches.append({"path": relative, "reason": description, "upstreamSha256": expected,
                    "hostedSha256": hashlib.sha256(target.read_bytes()).hexdigest()})


for relative in ("index.html", "200.html", "404.html"):
    target = PUBLIC / relative
    before = target.read_bytes()
    if hashlib.sha256(before).hexdigest() != originals[relative]["sha256"]:
        raise ValueError("HTML must match the pinned upstream before applying hosting patches.")
    content = before.decode("utf-8").replace('"/_nuxt/', '"/quant-native/jesse/_nuxt/')
    entry = '<script type="module" src="/quant-native/jesse/_nuxt/CuBS5wk3.js" crossorigin></script>'
    if content.count(entry) != 1:
        raise ValueError("Could not identify the pinned Nuxt entry module.")
    content = content.replace(entry, '<script type="module" src="/quant-native/jesse/welink-bootstrap.mjs"></script>')
    target.write_bytes(content.encode("utf-8"))
    patches.append({"path": relative, "reason": "Serve original assets under the local subpath and await authenticated host metadata.",
                    "upstreamSha256": originals[relative]["sha256"], "hostedSha256": hashlib.sha256(target.read_bytes()).hexdigest()})

change("_nuxt/CuBS5wk3.js", [
    ('initiate(){try{let e=``;e=c().public.appEnv===`production`?',
     'initiate(){return;try{let e=``;e=c().public.appEnv===`production`?'),
    ('function so(e){let t=J();return{createClient:n=>{let r=n.getModel();',
     'function so(e){let t=J();return{createClient:n=>{return;let r=n.getModel();'),
], "Disable the original hard-coded same-origin trading WebSocket and localhost Pyright socket until a verified native WebSocket gateway exists. No replacement data is generated.")

change("_nuxt/CE0DBSD2.js", [('var X=Ct(`main`,{state:', 'var X=Ct(`welink-jesse-main`,{state:')],
       "Isolate original auth/account cache storage from other same-origin applications; host bootstrap resets this cache each visit.")

(PUBLIC / "welink-bootstrap.mjs").write_bytes((HERE / "welink-bootstrap.mjs").read_bytes())
(HERE / "PATCHES.json").write_text(json.dumps({"version": 1, "patches": patches}, indent=2) + "\n", encoding="utf-8")
print(f"Applied {len(patches)} documented hosting patches. No UI layout or strategy implementation changed.")
