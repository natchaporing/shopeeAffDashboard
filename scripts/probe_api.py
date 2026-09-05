#!/usr/bin/env python
"""Step 1 of the build order: prove one live pull returns products.

    python scripts/probe_api.py                 # ping + first page, prints a few products
    python scripts/probe_api.py --pages 3       # walk 3 pages and save data/raw/probe.json
    python scripts/probe_api.py --introspect    # list every root query the region exposes
    python scripts/probe_api.py --type ProductOfferV2   # dump fields of one GraphQL type
    python scripts/probe_api.py --try-both      # retry with the other signature mode on auth failure

Exit code 0 = auth works and products came back. Anything else prints the GraphQL / HTTP
error verbatim so the region / credentials / signature mode can be fixed before building on.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shopee_aff.config import get_settings  # noqa: E402
from shopee_aff.normalize import normalize_offer  # noqa: E402
from shopee_aff.shopee_client import ShopeeAPIError, ShopeeClient  # noqa: E402
from datetime import date  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--introspect", action="store_true")
    ap.add_argument("--type", dest="type_name")
    ap.add_argument("--try-both", action="store_true", help="retry with the other signature mode if auth fails")
    ap.add_argument("--cat", type=int, default=None, help="productCatId filter")
    args = ap.parse_args()

    settings = get_settings()
    if not settings.has_credentials:
        print("SHOPEE_APP_ID / SHOPEE_APP_SECRET missing. Copy .env.example to .env and fill them in.")
        return 2
    print(f"endpoint      : {settings.endpoint}")
    print(f"signature mode: {settings.shopee_signature_mode}")

    modes = [settings.shopee_signature_mode]
    if args.try_both:
        modes.append("hmac" if modes[0] == "sha256" else "sha256")

    last_err: Exception | None = None
    for mode in modes:
        s = settings.model_copy(update={"shopee_signature_mode": mode})
        try:
            with ShopeeClient(s) as client:
                ping = client.ping()
                print(f"ping OK with mode={mode}: {json.dumps(ping)[:200]}")
                if args.introspect:
                    fields = client.introspect_root()
                    print(f"\n{len(fields)} root queries:")
                    for f in fields:
                        argnames = ", ".join(a["name"] for a in f.get("args", []))
                        print(f"  - {f['name']}({argnames})")
                    feedish = [f["name"] for f in fields if any(k in f["name"].lower() for k in ("feed", "item", "list"))]
                    print(f"\nfeed-like queries: {feedish or 'none found'}")
                if args.type_name:
                    t = client.introspect_type(args.type_name)
                    print(f"\ntype {args.type_name}:")
                    for f in (t or {}).get("fields") or []:
                        ty = f["type"]
                        name = ty.get("name") or (ty.get("ofType") or {}).get("name") or ((ty.get("ofType") or {}).get("ofType") or {}).get("name")
                        print(f"  - {f['name']}: {name}")
                nodes = list(client.iter_product_offers(product_cat_id=args.cat, max_pages=args.pages))
                print(f"\n{len(nodes)} products over {args.pages} page(s)")
                for n in nodes[:5]:
                    row = normalize_offer(n, date.today())
                    print(f"  #{row.rank:<4} {row.item_id} {row.title[:50]!r} price={row.price} comm={row.commission_rate} sales={row.monthly_sales} rating={row.rating}")
                out = Path(__file__).resolve().parent.parent / "data" / "raw" / "probe.json"
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_text(json.dumps(nodes, ensure_ascii=False, indent=1), "utf-8")
                print(f"raw nodes saved to {out}")
                if mode != settings.shopee_signature_mode:
                    print(f"\n>>> set SHOPEE_SIGNATURE_MODE={mode} in .env")
                return 0 if nodes else 1
        except ShopeeAPIError as exc:
            last_err = exc
            print(f"mode={mode} failed: {exc}")
    print(f"\nFAILED: {last_err}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
