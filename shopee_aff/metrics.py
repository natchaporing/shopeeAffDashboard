"""Pure metric functions over one day's rows plus rank history.

Nothing in here touches the database; ingest.py feeds it plain Python data so the
formulas are trivially unit-testable and re-runnable when thresholds change.

Definitions
-----------
est_monthly_revenue = price * commission_rate * monthly_sales
gap_score           = monthly_sales / (partner_count + 1)        (partner_count NULL -> 0)
angel_score         = 0.40*sales' + 0.30*revenue' + 0.20*commission' + 0.10*review'
                      where x' is x normalised to 0..100 across the day's rows
                      (log scale for the heavy-tailed sales / revenue components)
rank_velocity       = rank[t-N] - rank[t]                        (positive = climbing)
rank_acceleration   = velocity[t] - velocity[t-N]
headroom            = max(0, rank - top_n)                        (distance to the top-N)
breakout_score      = mean of (velocity', acceleration', gap', headroom') on 0..100
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Sequence

from .models import MetricRow, SnapshotRow

RankHistory = dict[int, dict[date, int]]  # item_id -> {snapshot_date: rank}


@dataclass(frozen=True)
class MetricConfig:
    velocity_window_days: int = 3
    top_n: int = 10
    w_sales: float = 0.40
    w_revenue: float = 0.30
    w_commission: float = 0.20
    w_review: float = 0.10


# --- scalar helpers ----------------------------------------------------------

def est_monthly_revenue(price: float | None, commission_rate: float | None, monthly_sales: int | None) -> float | None:
    if price is None or commission_rate is None or monthly_sales is None:
        return None
    return round(price * commission_rate * monthly_sales, 2)


def gap_score(monthly_sales: int | None, partner_count: int | None) -> float | None:
    if monthly_sales is None:
        return None
    return round(monthly_sales / ((partner_count or 0) + 1), 4)


def headroom(rank: int | None, top_n: int) -> int | None:
    if rank is None:
        return None
    return max(0, rank - top_n)


def normalize_0_100(values: Sequence[float | None], log_scale: bool = False) -> list[float | None]:
    """Min-max scale to 0..100, ignoring None. A constant series maps to 50."""
    xs = [v for v in values if v is not None]
    if not xs:
        return [None] * len(values)
    f = (lambda v: math.log1p(max(v, 0.0))) if log_scale else (lambda v: v)
    lo, hi = min(f(v) for v in xs), max(f(v) for v in xs)
    if hi - lo < 1e-12:
        return [50.0 if v is not None else None for v in values]
    return [round((f(v) - lo) / (hi - lo) * 100.0, 2) if v is not None else None for v in values]


def percentile_ranks(values: Sequence[float | None]) -> list[float | None]:
    """0..100 percentile rank (share of non-null values strictly below each value)."""
    xs = sorted(v for v in values if v is not None)
    n = len(xs)
    if n == 0:
        return [None] * len(values)
    if n == 1:
        return [100.0 if v is not None else None for v in values]
    import bisect

    return [round(bisect.bisect_left(xs, v) / (n - 1) * 100.0, 2) if v is not None else None for v in values]


def _rank_on_or_before(hist: dict[date, int], target: date, not_before: date) -> int | None:
    """Rank on `target`, or the closest earlier snapshot no older than `not_before`."""
    d = target
    while d >= not_before:
        if d in hist:
            return hist[d]
        d -= timedelta(days=1)
    return None


def rank_velocity(hist: dict[date, int], today: date, window: int) -> float | None:
    now = hist.get(today)
    if now is None:
        return None
    then = _rank_on_or_before(hist, today - timedelta(days=window), today - timedelta(days=2 * window) + timedelta(days=1))
    if then is None:
        return None
    return float(then - now)


def rank_acceleration(hist: dict[date, int], today: date, window: int) -> float | None:
    v_now = rank_velocity(hist, today, window)
    if v_now is None:
        return None
    # velocity over the previous window, anchored on the snapshot nearest to t-N
    prev_anchor = None
    d = today - timedelta(days=window)
    while d > today - timedelta(days=2 * window):
        if d in hist:
            prev_anchor = d
            break
        d -= timedelta(days=1)
    if prev_anchor is None:
        return None
    v_prev = rank_velocity(hist, prev_anchor, window)
    if v_prev is None:
        return None
    return v_now - v_prev


def angel_components(rows: Sequence[SnapshotRow], revenues: Sequence[float | None]) -> list[float | None]:
    sales_n = normalize_0_100([r.monthly_sales for r in rows], log_scale=True)
    rev_n = normalize_0_100(list(revenues), log_scale=True)
    comm_n = normalize_0_100([r.commission_rate for r in rows])
    review_n = normalize_0_100([r.rating for r in rows])
    return [sales_n, rev_n, comm_n, review_n]  # type: ignore[return-value]


def angel_score(sales_n: float | None, rev_n: float | None, comm_n: float | None, review_n: float | None, cfg: MetricConfig) -> float | None:
    """Weighted blend; missing components are dropped and the weights renormalised."""
    parts = [(sales_n, cfg.w_sales), (rev_n, cfg.w_revenue), (comm_n, cfg.w_commission), (review_n, cfg.w_review)]
    avail = [(v, w) for v, w in parts if v is not None]
    if not avail:
        return None
    total_w = sum(w for _, w in avail)
    return round(sum(v * w for v, w in avail) / total_w, 2)


# --- day-level computation ---------------------------------------------------

def compute_day(rows: Sequence[SnapshotRow], history: RankHistory, cfg: MetricConfig | None = None) -> list[MetricRow]:
    """Compute every metric for the given day's rows. `history` must include today's ranks."""
    cfg = cfg or MetricConfig()
    if not rows:
        return []
    today = rows[0].snapshot_date
    N = cfg.velocity_window_days

    revenues = [est_monthly_revenue(r.price, r.commission_rate, r.monthly_sales) for r in rows]
    gaps = [gap_score(r.monthly_sales, r.partner_count) for r in rows]
    gap_pct = percentile_ranks(gaps)
    sales_n, rev_n, comm_n, review_n = angel_components(rows, revenues)

    vel = [rank_velocity(history.get(r.item_id, {}), today, N) for r in rows]
    acc = [rank_acceleration(history.get(r.item_id, {}), today, N) for r in rows]
    head = [headroom(r.rank, cfg.top_n) for r in rows]

    vel_n = normalize_0_100(vel)
    acc_n = normalize_0_100(acc)
    gap_n = normalize_0_100(gaps, log_scale=True)
    head_n = normalize_0_100([float(h) if h is not None else None for h in head], log_scale=True)

    out: list[MetricRow] = []
    for i, r in enumerate(rows):
        comps = [c for c in (vel_n[i], acc_n[i], gap_n[i], head_n[i]) if c is not None]
        breakout = round(sum(comps) / len(comps), 2) if comps else None
        out.append(
            MetricRow(
                item_id=r.item_id,
                snapshot_date=today,
                est_monthly_revenue=revenues[i],
                gap_score=gaps[i],
                gap_percentile=gap_pct[i],
                angel_score=angel_score(sales_n[i], rev_n[i], comm_n[i], review_n[i], cfg),
                rank_velocity=vel[i],
                rank_acceleration=acc[i],
                headroom=head[i],
                breakout_score=breakout,
                history_days=len(history.get(r.item_id, {})) or 1,
            )
        )
    return out


def build_history(records: Iterable[tuple[int, date, int | None]]) -> RankHistory:
    """(item_id, snapshot_date, rank) tuples -> RankHistory (ranks that are NULL are skipped)."""
    hist: RankHistory = {}
    for item_id, d, rank in records:
        if rank is None:
            continue
        hist.setdefault(item_id, {})[d] = rank
    return hist
