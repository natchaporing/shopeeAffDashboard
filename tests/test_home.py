from shopee_aff.home import build_suggestions, reasons, suggestion_score


def row(**kw):
    base = dict(item_id=1, title="x", rank=50, monthly_sales=800, partner_count=2, commission_rate=0.12, rating=4.9,
                est_monthly_revenue=9600.0, angel_score=60.0, breakout_score=40.0, rank_velocity=12.0,
                gap_percentile=90.0, signal="Hidden", cumulative_sales=None)
    base.update(kw)
    return base


def test_score_prefers_good_signals_and_penalises_fading():
    assert suggestion_score(row(signal="Rocket")) > suggestion_score(row(signal="Steady"))
    assert suggestion_score(row(signal="Fading")) < suggestion_score(row(signal="Single"))


def test_reasons_are_plain_language_and_capped():
    r = reasons(row(signal="Rocket", rank=5), 3)
    assert r[0] == "Just broke into the top 10 (now #5)"
    assert any("Climbed 12 places" in x for x in r)
    assert len(r) <= 3


def test_build_suggestions_filters_and_sorts():
    rows = [row(item_id=1, signal="Fading"), row(item_id=2, monthly_sales=0), row(item_id=3, signal="Rocket"), row(item_id=4, signal="Steady")]
    out = build_suggestions(rows, 3)
    assert [r["item_id"] for r in out] == [3, 4]
    assert out[0]["reasons"] and "suggest_score" in out[0]


def test_build_suggestions_caps_dominant_signal():
    rows = [row(item_id=i, signal="Hidden", angel_score=90.0) for i in range(20)]
    rows += [row(item_id=100, signal="Rocket", angel_score=10.0, breakout_score=10.0), row(item_id=101, signal="Steady", angel_score=5.0, breakout_score=5.0)]
    out = build_suggestions(rows, 3, limit=12)
    sigs = [r["signal"] for r in out]
    # first pass caps Hidden at 5 so Rocket/Steady get in; leftovers then fill the list back up to 12
    assert "Rocket" in sigs and "Steady" in sigs and len(out) == 12 and sigs.count("Hidden") == 10
    assert build_suggestions(rows, 3, limit=6, per_signal=2)[0]["signal"] == "Hidden"
