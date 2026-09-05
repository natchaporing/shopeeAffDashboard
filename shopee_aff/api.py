"""FastAPI read layer + dashboard.

Endpoints
    GET  /                      dashboard (HTML)
    GET  /api/meta              available dates, categories, signal counts, recent runs
    GET  /api/products          filter / sort / paginate one day's rows (+metrics)
    GET  /api/products/{id}     one item with its full daily history
    GET  /api/export.csv        same filters as /api/products, CSV
    GET  /api/export.json       same filters as /api/products, JSON
    POST /api/ingest            trigger a pull now (?mock=1 for synthetic data)
    GET  /health
"""
from __future__ import annotations

import csv
import io
import logging
import threading
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from psycopg import sql

from .config import get_settings
from .db import connect, migrate
from .ingest import run_ingest
from .home import build_suggestions
from .scheduler import build_scheduler
from .signals import SIGNALS

log = logging.getLogger(__name__)
TEMPLATES = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

SORTABLE = {
    "rank", "title", "category", "price", "commission_rate", "monthly_sales", "cumulative_sales", "rating",
    "partner_count", "est_monthly_revenue", "gap_score", "angel_score", "rank_velocity", "rank_acceleration",
    "breakout_score", "signal", "history_days", "item_id", "shop_name",
}
PRODUCT_COLS = [
    "item_id", "snapshot_date", "shop_id", "shop_name", "title", "category", "category_ids", "price", "price_max",
    "discount_rate", "commission_rate", "seller_commission_rate", "shopee_commission_rate", "monthly_sales",
    "cumulative_sales", "rating", "partner_count", "rank", "image_url", "product_link", "offer_link",
    "est_monthly_revenue", "gap_score", "gap_percentile", "angel_score", "rank_velocity", "rank_acceleration",
    "headroom", "breakout_score", "history_days", "signal",
]


def _clean(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    return v


def _row(rec: dict) -> dict:
    return {k: _clean(v) for k, v in rec.items()}


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    try:
        migrate(settings.database_url)
    except Exception as exc:  # noqa: BLE001
        log.error("database not reachable at startup: %s", exc)
    scheduler = build_scheduler(settings) if settings.ingest_enabled else None
    if scheduler:
        scheduler.start()
        log.info("daily ingest scheduled at %02d:%02d", settings.ingest_hour, settings.ingest_minute)
    app.state.scheduler = scheduler
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Shopee Affiliate Finder", version="0.1.0", lifespan=lifespan)


# --- helpers -----------------------------------------------------------------

def latest_date(conn) -> date | None:
    rec = conn.execute("SELECT max(snapshot_date) AS d FROM product_snapshots").fetchone()
    return rec["d"] if rec else None


def build_filters(
    snapshot_date: date,
    category: str | None,
    signal: str | None,
    min_price: float | None,
    max_price: float | None,
    min_commission: float | None,
    min_sales: int | None,
    min_rating: float | None,
    q: str | None,
) -> tuple[sql.Composed, list[Any]]:
    clauses = [sql.SQL("snapshot_date = %s")]
    params: list[Any] = [snapshot_date]
    if category:
        clauses.append(sql.SQL("category = %s"))
        params.append(category)
    if signal:
        sigs = [s.strip() for s in signal.split(",") if s.strip()]
        bad = [s for s in sigs if s not in SIGNALS]
        if bad:
            raise HTTPException(400, f"unknown signal(s): {bad}; valid: {SIGNALS}")
        clauses.append(sql.SQL("signal = ANY(%s)"))
        params.append(sigs)
    if min_price is not None:
        clauses.append(sql.SQL("price >= %s")); params.append(min_price)
    if max_price is not None:
        clauses.append(sql.SQL("price <= %s")); params.append(max_price)
    if min_commission is not None:
        # accept 5 (percent) or 0.05 (fraction)
        clauses.append(sql.SQL("commission_rate >= %s")); params.append(min_commission / 100 if min_commission > 1 else min_commission)
    if min_sales is not None:
        clauses.append(sql.SQL("monthly_sales >= %s")); params.append(min_sales)
    if min_rating is not None:
        clauses.append(sql.SQL("rating >= %s")); params.append(min_rating)
    if q:
        clauses.append(sql.SQL("(title ILIKE %s OR shop_name ILIKE %s)")); params += [f"%{q}%", f"%{q}%"]
    return sql.SQL(" AND ").join(clauses), params


def query_products(conn, where: sql.Composed, params: list[Any], sort: str, order: str, limit: int | None, offset: int) -> tuple[list[dict], int]:
    if sort not in SORTABLE:
        raise HTTPException(400, f"unsortable column {sort!r}")
    direction = sql.SQL("DESC") if order.lower() == "desc" else sql.SQL("ASC")
    total = conn.execute(sql.SQL("SELECT count(*) AS n FROM product_day WHERE ") + where, params).fetchone()["n"]
    stmt = sql.SQL("SELECT {cols} FROM product_day WHERE {where} ORDER BY {sort} {dir} NULLS LAST, item_id").format(
        cols=sql.SQL(", ").join(map(sql.Identifier, PRODUCT_COLS)), where=where, sort=sql.Identifier(sort), dir=direction
    )
    p = list(params)
    if limit is not None:
        stmt = stmt + sql.SQL(" LIMIT %s OFFSET %s")
        p += [limit, offset]
    return [_row(r) for r in conn.execute(stmt, p).fetchall()], total


def _resolve_date(conn, d: date | None) -> date:
    d = d or latest_date(conn)
    if d is None:
        raise HTTPException(404, "no snapshots yet - run `python -m shopee_aff.ingest` (add --mock for demo data)")
    return d


# --- routes ------------------------------------------------------------------

@app.get("/health")
def health():
    try:
        with connect() as conn:
            conn.execute("SELECT 1")
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=503)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return TEMPLATES.TemplateResponse(request, "index.html", {"signals": SIGNALS})


@app.get("/api/meta")
def meta(snapshot_date: date | None = Query(None, alias="date")):
    with connect() as conn:
        dates = [r["snapshot_date"].isoformat() for r in conn.execute(
            "SELECT DISTINCT snapshot_date FROM product_snapshots ORDER BY snapshot_date DESC LIMIT 60").fetchall()]
        if not dates:
            return {"dates": [], "latest": None, "categories": [], "signals": {}, "runs": []}
        d = snapshot_date or date.fromisoformat(dates[0])
        cats = conn.execute(
            "SELECT category, count(*) AS n FROM product_snapshots WHERE snapshot_date = %s AND category IS NOT NULL "
            "GROUP BY category ORDER BY n DESC", (d,)).fetchall()
        sigs = conn.execute(
            "SELECT signal, count(*) AS n FROM product_metrics WHERE snapshot_date = %s GROUP BY signal", (d,)).fetchall()
        runs = conn.execute(
            "SELECT id, snapshot_date, source, started_at, finished_at, status, rows_written, error "
            "FROM ingest_runs ORDER BY id DESC LIMIT 5").fetchall()
        total = conn.execute("SELECT count(*) AS n FROM product_snapshots WHERE snapshot_date = %s", (d,)).fetchone()["n"]
    return {
        "dates": dates,
        "latest": dates[0],
        "date": d.isoformat(),
        "total": total,
        "categories": [{"category": c["category"], "count": c["n"]} for c in cats],
        "signals": {s["signal"]: s["n"] for s in sigs},
        "signal_order": SIGNALS,
        "runs": [{k: (_clean(v) if not hasattr(v, "isoformat") else v.isoformat()) for k, v in r.items()} for r in runs],
    }


@app.get("/api/home")
def home(snapshot_date: date | None = Query(None, alias="date"), limit: int = Query(10, ge=1, le=50)):
    """Top lists for the home panel: most sales, highest commission, biggest revenue pool, suggested picks."""
    with connect() as conn:
        d = _resolve_date(conn, snapshot_date)
        where, params = build_filters(d, None, None, None, None, None, None, None, None)
        top_sales, _ = query_products(conn, where, params, "monthly_sales", "desc", limit, 0)
        top_revenue, _ = query_products(conn, where, params, "est_monthly_revenue", "desc", limit, 0)
        # highest commission among products that actually sell (avoid 30% commission on a dead listing)
        comm_where, comm_params = build_filters(d, None, None, None, None, None, 1, None, None)
        top_commission, _ = query_products(conn, comm_where, comm_params, "commission_rate", "desc", limit, 0)
        movers, _ = query_products(conn, where, params, "rank_velocity", "desc", limit, 0)
        all_rows, _ = query_products(conn, where, params, "breakout_score", "desc", None, 0)
    settings = get_settings()
    return {
        "date": d.isoformat(),
        "top_sales": top_sales,
        "top_commission": top_commission,
        "top_revenue": top_revenue,
        "movers": [m for m in movers if (m.get("rank_velocity") or 0) > 0],
        "suggestions": build_suggestions(all_rows, settings.velocity_window_days, limit=12),
    }


@app.get("/api/products")
def products(
    snapshot_date: date | None = Query(None, alias="date"),
    category: str | None = None,
    signal: str | None = Query(None, description="comma-separated: Rocket,Hidden,Rising,Fading,Proven,Steady,Single"),
    min_price: float | None = None,
    max_price: float | None = None,
    min_commission: float | None = Query(None, description="fraction (0.05) or percent (5)"),
    min_sales: int | None = None,
    min_rating: float | None = None,
    q: str | None = Query(None, description="title / shop substring"),
    sort: str = "breakout_score",
    order: str = "desc",
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    with connect() as conn:
        d = _resolve_date(conn, snapshot_date)
        where, params = build_filters(d, category, signal, min_price, max_price, min_commission, min_sales, min_rating, q)
        items, total = query_products(conn, where, params, sort, order, limit, offset)
    return {"date": d.isoformat(), "total": total, "limit": limit, "offset": offset, "items": items}


@app.get("/api/products/{item_id}")
def product_detail(item_id: int):
    with connect() as conn:
        hist = conn.execute(
            sql.SQL("SELECT {cols} FROM product_day WHERE item_id = %s ORDER BY snapshot_date").format(
                cols=sql.SQL(", ").join(map(sql.Identifier, PRODUCT_COLS))), (item_id,)).fetchall()
    if not hist:
        raise HTTPException(404, "item not found")
    rows = [_row(r) for r in hist]
    return {"item": rows[-1], "history": rows}


def _export_rows(snapshot_date, category, signal, min_price, max_price, min_commission, min_sales, min_rating, q, sort, order):
    with connect() as conn:
        d = _resolve_date(conn, snapshot_date)
        where, params = build_filters(d, category, signal, min_price, max_price, min_commission, min_sales, min_rating, q)
        items, _ = query_products(conn, where, params, sort, order, 50_000, 0)
    return d, items


@app.get("/api/export.json")
def export_json(
    snapshot_date: date | None = Query(None, alias="date"), category: str | None = None, signal: str | None = None,
    min_price: float | None = None, max_price: float | None = None, min_commission: float | None = None,
    min_sales: int | None = None, min_rating: float | None = None, q: str | None = None,
    sort: str = "breakout_score", order: str = "desc",
):
    d, items = _export_rows(snapshot_date, category, signal, min_price, max_price, min_commission, min_sales, min_rating, q, sort, order)
    return JSONResponse({"date": d.isoformat(), "total": len(items), "items": items},
                        headers={"Content-Disposition": f'attachment; filename="shopee_{d.isoformat()}.json"'})


@app.get("/api/export.csv")
def export_csv(
    snapshot_date: date | None = Query(None, alias="date"), category: str | None = None, signal: str | None = None,
    min_price: float | None = None, max_price: float | None = None, min_commission: float | None = None,
    min_sales: int | None = None, min_rating: float | None = None, q: str | None = None,
    sort: str = "breakout_score", order: str = "desc",
):
    d, items = _export_rows(snapshot_date, category, signal, min_price, max_price, min_commission, min_sales, min_rating, q, sort, order)
    cols = [c for c in PRODUCT_COLS if c not in ("category_ids",)]

    def gen():
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        yield buf.getvalue(); buf.seek(0); buf.truncate()
        for it in items:
            w.writerow(it)
            yield buf.getvalue(); buf.seek(0); buf.truncate()

    return StreamingResponse(gen(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="shopee_{d.isoformat()}.csv"'})


_ingest_lock = threading.Lock()


@app.post("/api/ingest")
def trigger_ingest(mock: bool = False, snapshot_date: date | None = Query(None, alias="date")):
    if not _ingest_lock.acquire(blocking=False):
        raise HTTPException(409, "an ingest is already running")
    try:
        settings = get_settings()
        if not mock and not settings.shopee_mock and not settings.has_credentials:
            raise HTTPException(400, "no Shopee credentials configured; pass ?mock=1 or fill .env")
        return run_ingest(snapshot_date, mock=mock or None, settings=settings)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"ingest failed: {type(exc).__name__}: {exc}") from exc
    finally:
        _ingest_lock.release()
