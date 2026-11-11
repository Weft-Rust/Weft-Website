"""Builds the docs section of the site from a checkout of the game repository.
    python tools/docs/build.py PATH_TO_WEFT_CHECKOUT [SITE_ROOT]
Writes docs/, docs.css and docs.js into SITE_ROOT (the site's root by default). The reference is
generated from crates/sdk first, so nothing in the checkout has to be prepared."""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.stdout.reconfigure(encoding="utf-8")

import api_ref
import docs

LINKS = {"repo": "https://github.com/Weft-Rust/Weft", "discord": "https://discord.gg/zTEekbrc7U"}


def main():
    weft = Path(sys.argv[1]).resolve()
    site = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else HERE.parent.parent
    api_ref.main(weft)
    shutil.rmtree(site / "docs", ignore_errors=True)
    docs.build_docs(site, LINKS, weft)


main()
