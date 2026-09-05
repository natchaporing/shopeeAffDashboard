"""Home-page picks: top lists + a scored "suggested for you" shortlist with plain-language reasons."""
from __future__ import annotations

from typing import Any

SIGNAL_BONUS = {"Rocket": 25.0, "Hidden": 20.0, "Rising": 12.0, "Proven": 10.0, "Steady": 0.0, "Single": -5.0, "Fading": -30.0}


def _f(v: Any) -> float | None:
    return None if v is None else float(v)


def suggestion_score(row: dict[str, Any]) -> float:
    angel = _f(row.get("angel_score")) or 0.0
    breakout = _f(row.get("breakout_score")) or 0.0
    score = 0.5 * angel + 0.5 * breakout + SIGNAL_BONUS.get(row.get("signal") or "", 0.0)
    if (_f(row.get("commission_rate")) or 0.0) >= 0.10:
        score += 5.0
    if (_f(row.get("rating")) or 0.0) >= 4.8:
        score += 3.0
    return round(score, 2)


def reasons(row: dict[str, Any], window_days: int) -> list[str]:
    out: list[str] = []
    sig = row.get("signal")
    vel = _f(row.get("rank_velocity"))
    rank = row.get("rank")
    sales = row.get("monthly_sales")
    partners = row.get("partner_count")
    comm = _f(row.get("commission_rate"))
    rev = _f(row.get("est_monthly_revenue"))
    rating = _f(row.get("rating"))
    cum = row.get("cumulative_sales")
    gap_pct = _f(row.get("gap_percentile"))

    if sig == "Rocket" and rank is not None:
        out.append(f"Just broke into the top 10 (now #{rank})")
    if vel is not None and vel >= 2:
        out.append(f"Climbed {int(vel)} places in {window_days} days")
    if sig == "Hidden" or (gap_pct is not None and gap_pct >= 80 and (sales or 0) > 0):
        if partners == 0:
            out.append(f"{sales:,} sales/month and no creators promoting it yet")
        elif partners is not None:
            out.append(f"{sales:,} sales/month but only {partners} creator{'s' if partners != 1 else ''} promoting it")
        else:
            out.append(f"{sales:,} sales/month with little creator competition")
    if comm is not None and comm >= 0.10:
        out.append(f"High commission ({comm * 100:.1f}%)")
    if rev is not None and rev > 0:
        out.append(f"Est. affiliate revenue pool ~{rev:,.0f}/month")
    if sig == "Proven" and cum:
        out.append(f"Proven seller: {cum:,} lifetime sales, rating {rating:.1f}")
    elif rating is not None and rating >= 4.8:
        out.append(f"Rated {rating:.1f}")
    if not out and sales:
        out.append(f"{sales:,} sales/month")
    return out[:3]


def build_suggestions(rows: list[dict[str, Any]], window_days: int, limit: int = 12, per_signal: int | None = None) -> list[dict[str, Any]]:
    """Best-scored rows, but no single signal may fill more than ~40% of the list (keeps Rockets/Proven visible)."""
    scored = []
    for r in rows:
        if r.get("signal") == "Fading":
            continue
        if not r.get("monthly_sales"):
            continue
        s = suggestion_score(r)
        scored.append({**r, "suggest_score": s, "reasons": reasons(r, window_days)})
    scored.sort(key=lambda r: (-r["suggest_score"], r.get("rank") or 10**9))

    cap = per_signal or max(1, round(limit * 0.4))
    picked: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    leftovers: list[dict[str, Any]] = []
    for r in scored:
        sig = r.get("signal") or ""
        if counts.get(sig, 0) < cap:
            picked.append(r)
            counts[sig] = counts.get(sig, 0) + 1
        else:
            leftovers.append(r)
        if len(picked) >= limit:
            break
    if len(picked) < limit:
        picked.extend(leftovers[: limit - len(picked)])
    picked.sort(key=lambda r: -r["suggest_score"])
    return picked
