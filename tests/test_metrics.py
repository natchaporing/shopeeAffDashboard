from datetime import date, timedelta

from shopee_aff.metrics import (MetricConfig, angel_score, build_history, compute_day, est_monthly_revenue, gap_score,
                                headroom, normalize_0_100, percentile_ranks, rank_acceleration, rank_velocity)
from shopee_aff.models import SnapshotRow

D = date(2026, 9, 5)


def test_scalar_formulas():
    assert est_monthly_revenue(100.0, 0.1, 50) == 500.0
    assert est_monthly_revenue(None, 0.1, 50) is None
    assert gap_score(1000, 4) == 200.0
    assert gap_score(1000, None) == 1000.0
    assert headroom(35, 10) == 25 and headroom(3, 10) == 0


def test_normalize_and_percentiles():
    assert normalize_0_100([0, 5, 10]) == [0.0, 50.0, 100.0]
    assert normalize_0_100([7, 7]) == [50.0, 50.0]
    assert normalize_0_100([None, 1, 3])[0] is None
    assert normalize_0_100([0, 9, 99], log_scale=True)[1] == 50.0
    assert percentile_ranks([10, 20, 30, 40]) == [0.0, 33.33, 66.67, 100.0]
    assert percentile_ranks([5]) == [100.0]


def test_velocity_uses_nearest_older_snapshot_within_window():
    hist = {D: 5, D - timedelta(days=4): 20}  # nothing exactly at t-3, but t-4 is inside the fallback range
    assert rank_velocity(hist, D, 3) == 15.0
    assert rank_velocity({D: 5}, D, 3) is None
    assert rank_velocity({D: 5, D - timedelta(days=9): 1}, D, 3) is None  # too old


def test_acceleration():
    hist = {D - timedelta(days=6): 40, D - timedelta(days=3): 30, D: 10}
    assert rank_velocity(hist, D, 3) == 20.0
    assert rank_acceleration(hist, D, 3) == 10.0  # 20 now vs 10 before
    assert rank_acceleration({D: 1, D - timedelta(days=3): 4}, D, 3) is None


def test_angel_score_weights_and_renormalisation():
    cfg = MetricConfig()
    assert angel_score(100, 100, 100, 100, cfg) == 100.0
    assert angel_score(100, 0, 0, 0, cfg) == 40.0
    assert angel_score(100, None, None, None, cfg) == 100.0  # only sales available -> full weight
    assert angel_score(None, None, None, None, cfg) is None


def _row(i, rank, sales, price=100.0, comm=0.1, partners=0, rating=4.5):
    return SnapshotRow(item_id=i, snapshot_date=D, rank=rank, monthly_sales=sales, price=price,
                       commission_rate=comm, partner_count=partners, rating=rating)


def test_compute_day_end_to_end():
    rows = [_row(1, 1, 1000, comm=0.2), _row(2, 50, 100, partners=10), _row(3, 200, 5000, partners=0, comm=0.05)]
    hist = build_history([
        (1, D, 1), (1, D - timedelta(days=3), 1),
        (2, D, 50), (2, D - timedelta(days=3), 80), (2, D - timedelta(days=6), 90),
        (3, D, 200),
    ])
    out = compute_day(rows, hist, MetricConfig(velocity_window_days=3, top_n=10))
    by = {m.item_id: m for m in out}
    assert by[1].est_monthly_revenue == 100 * 0.2 * 1000
    assert by[2].rank_velocity == 30.0 and by[2].rank_acceleration == 20.0
    assert by[3].rank_velocity is None and by[3].history_days == 1
    assert by[3].gap_score == 5000.0 and by[3].gap_percentile == 100.0
    assert by[1].headroom == 0 and by[3].headroom == 190
    assert all(0 <= m.angel_score <= 100 for m in out)
    assert all(m.breakout_score is not None for m in out)
    assert by[1].angel_score > by[2].angel_score
