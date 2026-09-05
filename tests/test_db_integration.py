"""Runs only when TEST_DATABASE_URL points at a scratch Postgres (tables are created there)."""
import os
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="TEST_DATABASE_URL not set")


@pytest.fixture(scope="module")
def settings():
    from shopee_aff.config import Settings
    return Settings(database_url=os.environ["TEST_DATABASE_URL"], shopee_mock=True, ingest_enabled=False, _env_file=None)


@pytest.fixture(scope="module")
def client(settings):
    from shopee_aff import api, config
    config.get_settings.cache_clear()
    config.get_settings = lambda: settings  # type: ignore[assignment]
    api.get_settings = lambda: settings  # type: ignore[assignment]
    import shopee_aff.db as db
    db.get_settings = lambda: settings  # type: ignore[assignment]
    from fastapi.testclient import TestClient
    with TestClient(api.app) as c:
        yield c


def test_ingest_then_query(client, settings):
    from shopee_aff.ingest import run_ingest
    end = date(2026, 3, 10)
    for i in range(4, -1, -1):
        res = run_ingest(end - timedelta(days=i), mock=True, settings=settings)
        assert res["rows"] == 300

    meta = client.get("/api/meta").json()
    assert meta["latest"] == end.isoformat() and sum(meta["signals"].values()) == 300

    r = client.get("/api/products", params={"sort": "rank", "order": "asc", "limit": 5}).json()
    assert r["total"] == 300 and [x["rank"] for x in r["items"]] == [1, 2, 3, 4, 5]
    assert r["items"][0]["signal"] in {"Rocket", "Hidden", "Rising", "Fading", "Proven", "Steady", "Single"}

    r = client.get("/api/products", params={"signal": "Hidden,Rising", "min_commission": 5}).json()
    assert all(x["signal"] in ("Hidden", "Rising") and x["commission_rate"] >= 0.05 for x in r["items"])

    assert client.get("/api/products", params={"signal": "Bogus"}).status_code == 400
    assert client.get("/api/products", params={"sort": "raw"}).status_code == 400

    d = client.get(f"/api/products/{r['items'][0]['item_id']}").json()
    assert len(d["history"]) == 5

    csv = client.get("/api/export.csv", params={"signal": "Hidden"}).text.splitlines()
    assert csv[0].startswith("item_id,snapshot_date") and len(csv) - 1 == meta["signals"].get("Hidden", 0)
    js = client.get("/api/export.json").json()
    assert js["total"] == 300

    assert client.post("/api/ingest", params={"mock": 1, "date": end.isoformat()}).json()["rows"] == 300


def test_home_endpoint(client):
    h = client.get("/api/home").json()
    assert len(h["top_sales"]) == 10 and h["top_sales"][0]["monthly_sales"] >= h["top_sales"][-1]["monthly_sales"]
    assert all(x["monthly_sales"] >= 1 for x in h["top_commission"])
    assert h["top_commission"][0]["commission_rate"] >= h["top_commission"][-1]["commission_rate"]
    assert h["suggestions"] and all(s["signal"] != "Fading" and s["reasons"] for s in h["suggestions"])
    assert all(m["rank_velocity"] > 0 for m in h["movers"])
