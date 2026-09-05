"""Daily pull: fetch feed -> upsert snapshot rows -> compute metrics -> classify signals.

CLI:
    python -m shopee_aff.ingest                 # pull today (live, or mock if SHOPEE_MOCK=1)
    python -m shopee_aff.ingest --date 2026-09-01
    python -m shopee_aff.ingest --mock --date 2026-09-01
    python -m shopee_aff.ingest --recompute --date 2026-09-01   # metrics only, no fetch
    python -m shopee_aff.ingest --backfill-mock 10              # 10 days of synthetic history
"""
from __future__ import annotations

import argparse
import json
import logging
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import psycopg
from psycopg.types.json import Jsonb

from . import mock_source
from .config import Settings, get_settings
from .db import connect, migrate
from .metrics import MetricConfig, build_history, compute_day
from .models import MetricRow, SnapshotRow
from .normalize import normalize_offer
from .signals import SignalThresholds, classify_all

log = logging.getLogger(__name__)
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def metric_config(s: Settings) -> MetricConfig:
    return MetricConfig(velocity_window_days=s.velocity_window_days, top_n=s.rocket_top_n)


def thresholds(s: Settings) -> SignalThresholds:
    return SignalThresholds(
        top_n=s.rocket_top_n,
        hidden_min_monthly_sales=s.hidden_min_monthly_sales,
        hidden_min_gap_percentile=s.hidden_min_gap_percentile,
        proven_min_cumulative_sales=s.proven_min_cumulative_sales,
        proven_min_rating=s.proven_min_rating,
        rising_min_velocity=s.rising_min_velocity,
        fading_max_velocity=s.fading_max_velocity,
    )


# --- fetch -------------------------------------------------------------------

def fetch_rows(snapshot_date: date, settings: Settings, mock: bool = False, save_raw: bool = True) -> list[SnapshotRow]:
    """Pull the feed(s) and return de-duplicated SnapshotRows (first/lowest position wins)."""
    seen: dict[int, SnapshotRow] = {}
    raw_nodes: list[dict] = []

    def take(node: dict) -> None:
        row = normalize_offer(node, snapshot_date)
        raw_nodes.append(node)
        if row.item_id not in seen:
            seen[row.item_id] = row

    if mock:
        for node in mock_source.generate(snapshot_date):
            take(node)
    else:
        from .shopee_client import ShopeeClient

        with ShopeeClient(settings) as client:
            cats: list[int | None] = settings.category_ids or [None]
            for cat in cats:
                for node in client.iter_product_offers(product_cat_id=cat):
                    take(node)

    if save_raw and not mock:
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        (RAW_DIR / f"{snapshot_date.isoformat()}.json").write_text(json.dumps(raw_nodes, ensure_ascii=False), "utf-8")

    rows = sorted(seen.values(), key=lambda r: (r.rank is None, r.rank or 0))
    log.info("fetched %s unique items for %s (%s raw nodes)", len(rows), snapshot_date, len(raw_nodes))
    return rows


# --- store -------------------------------------------------------------------

_SNAPSHOT_COLS = [
    "item_id", "snapshot_date", "shop_id", "title", "shop_name", "category", "category_ids", "price", "price_max",
    "discount_rate", "commission_rate", "seller_commission_rate", "shopee_commission_rate", "monthly_sales",
    "cumulative_sales", "rating", "partner_count", "rank", "image_url", "product_link", "offer_link", "raw",
]
_METRIC_COLS = [
    "item_id", "snapshot_date", "est_monthly_revenue", "gap_score", "gap_percentile", "angel_score", "rank_velocity",
    "rank_acceleration", "headroom", "breakout_score", "history_days", "signal",
]


def _upsert_sql(table: str, cols: list[str], extra_set: str = "") -> str:
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c not in ("item_id", "snapshot_date"))
    return (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT (item_id, snapshot_date) DO UPDATE SET {updates}{extra_set}"
    )


def upsert_snapshots(conn: psycopg.Connection, rows: Iterable[SnapshotRow]) -> int:
    sql = _upsert_sql("product_snapshots", _SNAPSHOT_COLS, ", fetched_at = now()")
    params = []
    for r in rows:
        d = asdict(r)
        d["raw"] = Jsonb(d["raw"]) if d["raw"] is not None else None
        params.append(tuple(d[c] for c in _SNAPSHOT_COLS))
    if not params:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, params)
    return len(params)


def upsert_metrics(conn: psycopg.Connection, metrics: Iterable[MetricRow]) -> int:
    sql = _upsert_sql("product_metrics", _METRIC_COLS, ", computed_at = now()")
    params = [tuple(asdict(m)[c] for c in _METRIC_COLS) for m in metrics]
    if not params:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, params)
    return len(params)


def load_rows(conn: psycopg.Connection, snapshot_date: date) -> list[SnapshotRow]:
    recs = conn.execute(
        f"SELECT {', '.join(c for c in _SNAPSHOT_COLS if c != 'raw')} FROM product_snapshots "
        "WHERE snapshot_date = %s ORDER BY rank NULLS LAST, item_id",
        (snapshot_date,),
    ).fetchall()
    rows = []
    for rec in recs:
        d = dict(rec)
        for k in ("price", "price_max", "discount_rate", "commission_rate", "seller_commission_rate",
                  "shopee_commission_rate", "rating"):
            if d.get(k) is not None:
                d[k] = float(d[k])
        rows.append(SnapshotRow(**d))
    return rows


def load_history(conn: psycopg.Connection, snapshot_date: date, item_ids: list[int], window: int):
    since = snapshot_date - timedelta(days=2 * window)
    recs = conn.execute(
        "SELECT item_id, snapshot_date, rank FROM product_snapshots "
        "WHERE snapshot_date BETWEEN %s AND %s AND item_id = ANY(%s)",
        (since, snapshot_date, item_ids),
    ).fetchall()
    return build_history((r["item_id"], r["snapshot_date"], r["rank"]) for r in recs)


# --- orchestration -----------------------------------------------------------

def compute_and_store_metrics(conn: psycopg.Connection, snapshot_date: date, settings: Settings) -> int:
    rows = load_rows(conn, snapshot_date)
    if not rows:
        log.warning("no snapshot rows for %s; nothing to compute", snapshot_date)
        return 0
    hist = load_history(conn, snapshot_date, [r.item_id for r in rows], settings.velocity_window_days)
    metrics = compute_day(rows, hist, metric_config(settings))
    classify_all(rows, metrics, thresholds(settings))
    n = upsert_metrics(conn, metrics)
    counts: dict[str, int] = {}
    for m in metrics:
        counts[m.signal] = counts.get(m.signal, 0) + 1
    log.info("metrics for %s: %s rows, signals=%s", snapshot_date, n, counts)
    return n


def run_ingest(snapshot_date: date | None = None, mock: bool | None = None, settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    snapshot_date = snapshot_date or today_utc()
    mock = settings.shopee_mock if mock is None else mock
    source = "mock" if mock else settings.endpoint
    migrate(settings.database_url)

    with connect(settings.database_url) as conn:
        run_id = conn.execute(
            "INSERT INTO ingest_runs (snapshot_date, source) VALUES (%s, %s) RETURNING id", (snapshot_date, source)
        ).fetchone()["id"]
        conn.commit()
        try:
            rows = fetch_rows(snapshot_date, settings, mock=mock)
            written = upsert_snapshots(conn, rows)
            conn.commit()
            metrics_n = compute_and_store_metrics(conn, snapshot_date, settings)
            conn.execute(
                "UPDATE ingest_runs SET finished_at = now(), status = 'ok', rows_written = %s WHERE id = %s",
                (written, run_id),
            )
            conn.commit()
            return {"run_id": run_id, "snapshot_date": snapshot_date.isoformat(), "source": source,
                    "rows": written, "metrics": metrics_n}
        except Exception as exc:  # noqa: BLE001 - record and re-raise
            conn.rollback()
            conn.execute(
                "UPDATE ingest_runs SET finished_at = now(), status = 'error', error = %s WHERE id = %s",
                (f"{type(exc).__name__}: {exc}"[:2000], run_id),
            )
            conn.commit()
            raise


MOCK_ID_LO, MOCK_ID_HI = 20_000_000_000, 20_001_000_000  # id range used by mock_source


def purge_mock(settings: Settings | None = None) -> int:
    """Delete every synthetic row (mock item-id range) so real data stands alone."""
    settings = settings or get_settings()
    with connect(settings.database_url) as conn:
        n = conn.execute(
            "DELETE FROM product_snapshots WHERE item_id >= %s AND item_id < %s", (MOCK_ID_LO, MOCK_ID_HI)
        ).rowcount
        conn.execute("DELETE FROM ingest_runs WHERE source = 'mock'")
        conn.commit()
    log.info("purged %s mock snapshot rows", n)
    return n


def seed_mock_if_empty(days: int, settings: Settings | None = None, end: date | None = None) -> int:
    """Backfill `days` days of synthetic history, but only when the database has no snapshots at all."""
    settings = settings or get_settings()
    if days <= 0:
        return 0
    migrate(settings.database_url)
    with connect(settings.database_url) as conn:
        if conn.execute("SELECT 1 FROM product_snapshots LIMIT 1").fetchone():
            return 0
    end = end or today_utc()
    for i in range(days - 1, -1, -1):
        run_ingest(end - timedelta(days=i), mock=True, settings=settings)
    log.info("seeded %s days of mock data ending %s", days, end)
    return days


def recompute(snapshot_date: date | None = None, settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    snapshot_date = snapshot_date or today_utc()
    with connect(settings.database_url) as conn:
        n = compute_and_store_metrics(conn, snapshot_date, settings)
        conn.commit()
    return n


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(description="Shopee affiliate daily ingest")
    p.add_argument("--date", type=date.fromisoformat, default=None, help="snapshot date (default: today UTC)")
    p.add_argument("--mock", action="store_true", help="use synthetic data instead of the live API")
    p.add_argument("--recompute", action="store_true", help="recompute metrics/signals for --date, no fetch")
    p.add_argument("--backfill-mock", type=int, metavar="DAYS", help="ingest DAYS days of synthetic history ending at --date")
    p.add_argument("--purge-mock", action="store_true", help="delete all synthetic rows")
    args = p.parse_args(argv)

    if args.purge_mock:
        print(f"deleted {purge_mock()} mock rows")
        return

    if args.recompute:
        print(f"recomputed metrics for {recompute(args.date)} rows")
        return
    if args.backfill_mock:
        end = args.date or today_utc()
        for i in range(args.backfill_mock - 1, -1, -1):
            print(run_ingest(end - timedelta(days=i), mock=True))
        return
    print(run_ingest(args.date, mock=args.mock or None))


if __name__ == "__main__":
    main()
