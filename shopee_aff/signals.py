"""Rule-based signal buckets.

Evaluated in priority order; the first matching rule wins.
  Single  - fewer than 2 snapshots (nothing to compare against)
  Rocket  - in the top-N today, was outside the top-N one window ago
  Proven  - huge cumulative sales AND rating >= 4.8
  Hidden  - high monthly sales AND high gap_score (few creators per sale)
  Rising  - velocity >= RISING_MIN_VELOCITY
  Fading  - velocity <= FADING_MAX_VELOCITY
  Steady  - has history but is not moving enough either way
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .models import MetricRow, SnapshotRow

SIGNALS = ["Rocket", "Hidden", "Rising", "Fading", "Proven", "Steady", "Single"]


@dataclass(frozen=True)
class SignalThresholds:
    top_n: int = 10
    hidden_min_monthly_sales: int = 500
    hidden_min_gap_percentile: float = 80.0
    proven_min_cumulative_sales: int = 10_000
    proven_min_rating: float = 4.8
    rising_min_velocity: float = 3.0
    fading_max_velocity: float = -3.0
    min_history_days: int = 2


def classify(row: SnapshotRow, m: MetricRow, t: SignalThresholds) -> str:
    if m.history_days < t.min_history_days:
        return "Single"

    if (
        row.rank is not None
        and row.rank <= t.top_n
        and m.rank_velocity is not None
        and (row.rank + m.rank_velocity) > t.top_n  # rank one window ago = rank + velocity
    ):
        return "Rocket"

    if (
        row.cumulative_sales is not None
        and row.cumulative_sales >= t.proven_min_cumulative_sales
        and row.rating is not None
        and row.rating >= t.proven_min_rating
    ):
        return "Proven"

    if (
        row.monthly_sales is not None
        and row.monthly_sales >= t.hidden_min_monthly_sales
        and m.gap_percentile is not None
        and m.gap_percentile >= t.hidden_min_gap_percentile
    ):
        return "Hidden"

    if m.rank_velocity is None:
        return "Single"
    if m.rank_velocity >= t.rising_min_velocity:
        return "Rising"
    if m.rank_velocity <= t.fading_max_velocity:
        return "Fading"
    return "Steady"


def classify_all(rows: Sequence[SnapshotRow], metrics: Sequence[MetricRow], t: SignalThresholds) -> None:
    """Fill `signal` on each MetricRow in place (rows and metrics are index-aligned)."""
    for row, m in zip(rows, metrics):
        m.signal = classify(row, m, t)
