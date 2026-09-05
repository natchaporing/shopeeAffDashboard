from datetime import date

from shopee_aff.models import MetricRow, SnapshotRow
from shopee_aff.signals import SignalThresholds, classify

D = date(2026, 9, 5)
T = SignalThresholds()


def row(**kw):
    base = dict(item_id=1, snapshot_date=D, rank=100, monthly_sales=100, rating=4.5, cumulative_sales=100)
    base.update(kw)
    return SnapshotRow(**base)


def m(**kw):
    base = dict(item_id=1, snapshot_date=D, history_days=5, rank_velocity=0.0, gap_percentile=10.0)
    base.update(kw)
    return MetricRow(**base)


def test_single_when_no_history():
    assert classify(row(), m(history_days=1), T) == "Single"
    assert classify(row(), m(rank_velocity=None), T) == "Single"


def test_rocket_requires_recent_jump_into_top_n():
    assert classify(row(rank=4), m(rank_velocity=30.0), T) == "Rocket"      # was 34, now 4
    assert classify(row(rank=4), m(rank_velocity=2.0), T) != "Rocket"       # was 6, already top-10
    assert classify(row(rank=12), m(rank_velocity=50.0), T) == "Rising"     # still outside top-10


def test_proven():
    assert classify(row(cumulative_sales=50_000, rating=4.9), m(), T) == "Proven"
    assert classify(row(cumulative_sales=50_000, rating=4.7), m(), T) == "Steady"
    assert classify(row(cumulative_sales=None, rating=4.9), m(), T) == "Steady"


def test_hidden():
    assert classify(row(monthly_sales=900), m(gap_percentile=95.0), T) == "Hidden"
    assert classify(row(monthly_sales=100), m(gap_percentile=95.0), T) == "Steady"
    assert classify(row(monthly_sales=900), m(gap_percentile=50.0), T) == "Steady"


def test_rising_fading_steady():
    assert classify(row(), m(rank_velocity=5.0), T) == "Rising"
    assert classify(row(), m(rank_velocity=-5.0), T) == "Fading"
    assert classify(row(), m(rank_velocity=1.0), T) == "Steady"


def test_priority_order():
    # a Rocket that is also Proven and Hidden is reported as Rocket
    r = row(rank=2, cumulative_sales=99_999, rating=5.0, monthly_sales=5000)
    assert classify(r, m(rank_velocity=40.0, gap_percentile=99.0), T) == "Rocket"
    # Proven beats Hidden
    r = row(cumulative_sales=99_999, rating=5.0, monthly_sales=5000)
    assert classify(r, m(gap_percentile=99.0), T) == "Proven"
