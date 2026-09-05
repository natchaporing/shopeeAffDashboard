import hashlib
import hmac
import json

import httpx
import pytest

from shopee_aff.config import Settings
from shopee_aff.shopee_client import ShopeeAPIError, ShopeeClient, auth_header, build_payload, sign


def test_payload_is_compact_and_drops_none_variables():
    p = build_payload("query { x }", {"a": 1, "b": None}, "Op")
    assert p == '{"query":"query { x }","variables":{"a":1},"operationName":"Op"}'
    assert json.loads(p)["variables"] == {"a": 1}


def test_sha256_signature_matches_documented_formula():
    payload = '{"query":"query { x }"}'
    expected = hashlib.sha256(f"app1700000000{payload}secret".encode()).hexdigest()
    assert sign("app", "secret", 1700000000, payload, "sha256") == expected


def test_hmac_signature_mode():
    payload = '{"query":"query { x }"}'
    expected = hmac.new(b"secret", f"app1700000000{payload}".encode(), hashlib.sha256).hexdigest()
    assert sign("app", "secret", 1700000000, payload, "hmac") == expected


def test_auth_header_format():
    h = auth_header("app", "secret", "{}", timestamp=42)
    assert h.startswith("SHA256 Credential=app, Timestamp=42, Signature=")
    assert len(h.rsplit("=", 1)[1]) == 64


def _settings(**kw) -> Settings:
    return Settings(shopee_app_id="app", shopee_app_secret="secret", shopee_region="co.th", _env_file=None, **kw)


def test_client_signs_exact_body_and_parses_nodes():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers["Authorization"]
        captured["body"] = request.content.decode()
        return httpx.Response(200, json={"data": {"productOfferV2": {
            "nodes": [{"itemId": 1, "productName": "A"}, {"itemId": 2, "productName": "B"}],
            "pageInfo": {"page": 1, "limit": 2, "hasNextPage": False}}}})

    client = ShopeeClient(_settings(), transport=httpx.MockTransport(handler))
    nodes, info = client.product_offers_page(page=1, limit=2)
    assert captured["url"] == "https://open-api.affiliate.shopee.co.th/graphql"
    assert [n["itemId"] for n in nodes] == [1, 2]
    assert info.has_next_page is False
    # signature must be over the exact bytes that were sent
    _, ts, sig = [p.split("=", 1)[1] for p in captured["auth"].replace("SHA256 ", "").split(", ")]
    assert sig == sign("app", "secret", int(ts), captured["body"])


def test_iter_pages_assigns_positions_and_stops():
    pages = {1: ([{"itemId": 1}, {"itemId": 2}], True), 2: ([{"itemId": 3}], False), 3: ([{"itemId": 99}], True)}

    def handler(request: httpx.Request) -> httpx.Response:
        page = json.loads(request.content)["variables"]["page"]
        nodes, more = pages[page]
        return httpx.Response(200, json={"data": {"productOfferV2": {"nodes": nodes, "pageInfo": {"page": page, "limit": 2, "hasNextPage": more}}}})

    client = ShopeeClient(_settings(), transport=httpx.MockTransport(handler))
    out = list(client.iter_product_offers(max_pages=10))
    assert [(n["itemId"], n["_position"]) for n in out] == [(1, 1), (2, 2), (3, 3)]


def test_graphql_errors_raise():
    def handler(request):
        return httpx.Response(200, json={"errors": [{"message": "Invalid Signature"}]})

    client = ShopeeClient(_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(ShopeeAPIError, match="Invalid Signature"):
        client.ping()


def test_missing_credentials():
    with pytest.raises(ShopeeAPIError):
        ShopeeClient(Settings(shopee_app_id="", shopee_app_secret="", _env_file=None))
