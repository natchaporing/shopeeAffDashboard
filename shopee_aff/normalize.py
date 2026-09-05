"""Map raw productOfferV2 nodes onto SnapshotRow.

Field availability notes (Shopee Affiliate Open API, productOfferV2):
  * `sales`            -> monthly_sales (Shopee's rolling sales figure for the offer)
  * `ratingStar`       -> rating
  * `commissionRate`, `sellerCommissionRate`, `shopeeCommissionRate` -> stored as fractions (0.05 = 5%)
  * `productCatIds`    -> category_ids; `category` = first id (top level), or CATEGORY_NAMES lookup
  * rank               -> listing position in the sorted feed we pulled (1 = top of that feed)
  * cumulative_sales / partner_count are NOT exposed by productOfferV2; they stay NULL unless a
    richer feed (see scripts/probe_api.py --introspect) provides them. Metrics degrade gracefully.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from .models import SnapshotRow

# Optional human-readable names for top-level productCatIds. Drop a JSON object
# {"100001": "Health & Beauty", ...} at data/category_names.json to enable.
_NAMES_PATH = Path(__file__).resolve().parent.parent / "data" / "category_names.json"
CATEGORY_NAMES: dict[str, str] = {}
if _NAMES_PATH.exists():
    try:
        CATEGORY_NAMES = {str(k): str(v) for k, v in json.loads(_NAMES_PATH.read_text("utf-8")).items()}
    except (ValueError, OSError):
        CATEGORY_NAMES = {}


def _num(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _int(v: Any) -> int | None:
    f = _num(v)
    return None if f is None else int(f)


def _rate(v: Any) -> float | None:
    """Commission rates arrive as strings such as "0.05" or occasionally "5.0" (percent)."""
    f = _num(v)
    if f is None:
        return None
    return f / 100.0 if f > 1.0 else f


def _first(node: dict[str, Any], *keys: str) -> Any:
    """First key present in the node (0 is a real value, so don't use `or`)."""
    for k in keys:
        if node.get(k) is not None:
            return node[k]
    return None


def category_label(cat_ids: list[int]) -> str | None:
    if not cat_ids:
        return None
    top = str(cat_ids[0])
    return CATEGORY_NAMES.get(top, top)


def normalize_offer(node: dict[str, Any], snapshot_date: date, rank: int | None = None) -> SnapshotRow:
    cat_ids = [int(c) for c in (node.get("productCatIds") or []) if _int(c) is not None]
    return SnapshotRow(
        item_id=int(node["itemId"]),
        snapshot_date=snapshot_date,
        title=str(node.get("productName") or ""),
        shop_id=_int(node.get("shopId")),
        shop_name=node.get("shopName"),
        category=category_label(cat_ids),
        category_ids=cat_ids,
        price=_num(node.get("priceMin")),
        price_max=_num(node.get("priceMax")),
        discount_rate=_num(node.get("priceDiscountRate")),
        commission_rate=_rate(node.get("commissionRate")),
        seller_commission_rate=_rate(node.get("sellerCommissionRate")),
        shopee_commission_rate=_rate(node.get("shopeeCommissionRate")),
        monthly_sales=_int(node.get("sales")),
        cumulative_sales=_int(_first(node, "cumulativeSales", "historicalSales")),
        rating=_num(node.get("ratingStar")),
        partner_count=_int(_first(node, "partnerCount", "creatorCount")),
        rank=rank if rank is not None else _int(node.get("_position")),
        image_url=node.get("imageUrl"),
        product_link=node.get("productLink"),
        offer_link=node.get("offerLink"),
        raw={k: v for k, v in node.items() if not k.startswith("_")},
    )
