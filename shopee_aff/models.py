"""Plain dataclasses shared by ingest, metrics and the API layer."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass
class SnapshotRow:
    item_id: int
    snapshot_date: date
    title: str = ""
    shop_id: int | None = None
    shop_name: str | None = None
    category: str | None = None
    category_ids: list[int] = field(default_factory=list)
    price: float | None = None
    price_max: float | None = None
    discount_rate: float | None = None
    commission_rate: float | None = None
    seller_commission_rate: float | None = None
    shopee_commission_rate: float | None = None
    monthly_sales: int | None = None
    cumulative_sales: int | None = None
    rating: float | None = None
    partner_count: int | None = None
    rank: int | None = None
    image_url: str | None = None
    product_link: str | None = None
    offer_link: str | None = None
    raw: dict[str, Any] | None = None


@dataclass
class MetricRow:
    item_id: int
    snapshot_date: date
    est_monthly_revenue: float | None = None
    gap_score: float | None = None
    gap_percentile: float | None = None
    angel_score: float | None = None
    rank_velocity: float | None = None
    rank_acceleration: float | None = None
    headroom: int | None = None
    breakout_score: float | None = None
    history_days: int = 1
    signal: str = "Single"
