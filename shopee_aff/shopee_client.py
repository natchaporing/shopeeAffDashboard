"""Signed GraphQL client for the Shopee Affiliate Open API.

Auth header (per Shopee's Open API docs):
    Authorization: SHA256 Credential=<appId>, Timestamp=<unix seconds>, Signature=<hex>
    Signature = SHA256(appId + timestamp + payload + appSecret)     # mode "sha256"

`payload` is the exact JSON body bytes we send, so the body is serialised once and
reused for both signing and sending. An HMAC-SHA256 variant is available behind
SHOPEE_SIGNATURE_MODE=hmac in case a region signs differently.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Iterator

import httpx

from .config import Settings, get_settings
from . import queries

log = logging.getLogger(__name__)


class ShopeeAPIError(RuntimeError):
    def __init__(self, message: str, errors: list[dict] | None = None, status: int | None = None):
        super().__init__(message)
        self.errors = errors or []
        self.status = status


def build_payload(query: str, variables: dict[str, Any] | None = None, operation_name: str | None = None) -> str:
    """Serialise a GraphQL request body deterministically (this exact string is signed)."""
    body: dict[str, Any] = {"query": query}
    if variables:
        # drop None so the server applies its own defaults
        body["variables"] = {k: v for k, v in variables.items() if v is not None}
    if operation_name:
        body["operationName"] = operation_name
    return json.dumps(body, separators=(",", ":"), ensure_ascii=False)


def sign(app_id: str, app_secret: str, timestamp: int, payload: str, mode: str = "sha256") -> str:
    """Return the hex signature for one request."""
    base = f"{app_id}{timestamp}{payload}"
    if mode == "hmac":
        return hmac.new(app_secret.encode("utf-8"), base.encode("utf-8"), hashlib.sha256).hexdigest()
    return hashlib.sha256(f"{base}{app_secret}".encode("utf-8")).hexdigest()


def auth_header(app_id: str, app_secret: str, payload: str, mode: str = "sha256", timestamp: int | None = None) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"SHA256 Credential={app_id}, Timestamp={ts}, Signature={sign(app_id, app_secret, ts, payload, mode)}"


@dataclass
class PageInfo:
    page: int
    limit: int
    has_next_page: bool
    scroll_id: str | None = None


class ShopeeClient:
    def __init__(self, settings: Settings | None = None, transport: httpx.BaseTransport | None = None):
        self.settings = settings or get_settings()
        if not self.settings.has_credentials:
            raise ShopeeAPIError("SHOPEE_APP_ID / SHOPEE_APP_SECRET are not set (see .env.example)")
        self._http = httpx.Client(timeout=self.settings.shopee_timeout_seconds, transport=transport)

    # -- low level ---------------------------------------------------------
    def execute(self, query: str, variables: dict[str, Any] | None = None, operation_name: str | None = None) -> dict[str, Any]:
        payload = build_payload(query, variables, operation_name)
        headers = {
            "Content-Type": "application/json",
            "Authorization": auth_header(
                self.settings.shopee_app_id, self.settings.shopee_app_secret, payload, self.settings.shopee_signature_mode
            ),
        }
        resp = self._http.post(self.settings.endpoint, content=payload.encode("utf-8"), headers=headers)
        if resp.status_code >= 400:
            raise ShopeeAPIError(f"HTTP {resp.status_code}: {resp.text[:500]}", status=resp.status_code)
        try:
            data = resp.json()
        except ValueError as exc:
            raise ShopeeAPIError(f"non-JSON response: {resp.text[:500]}") from exc
        if data.get("errors"):
            msgs = "; ".join(str(e.get("message")) for e in data["errors"])
            raise ShopeeAPIError(f"GraphQL error: {msgs}", errors=data["errors"], status=resp.status_code)
        return data.get("data") or {}

    # -- discovery -----------------------------------------------------------
    def ping(self) -> dict[str, Any]:
        return self.execute(queries.PING, operation_name="Ping")

    def introspect_root(self) -> list[dict[str, Any]]:
        data = self.execute(queries.INTROSPECT_ROOT, operation_name="Introspect")
        return data["__schema"]["queryType"]["fields"]

    def introspect_type(self, name: str) -> dict[str, Any]:
        return self.execute(queries.INTROSPECT_TYPE, {"name": name}, operation_name="IntrospectType")["__type"]

    def product_offers_page(
        self,
        page: int = 1,
        limit: int | None = None,
        list_type: int | None = None,
        sort_type: int | None = None,
        product_cat_id: int | None = None,
        keyword: str | None = None,
        shop_id: int | None = None,
        item_id: int | None = None,
    ) -> tuple[list[dict[str, Any]], PageInfo]:
        s = self.settings
        variables = {
            "page": page,
            "limit": limit or s.shopee_page_size,
            "listType": s.shopee_list_type if list_type is None else list_type,
            "sortType": s.shopee_sort_type if sort_type is None else sort_type,
            "productCatId": product_cat_id,
            "keyword": keyword,
            "shopId": shop_id,
            "itemId": item_id,
        }
        data = self.execute(queries.PRODUCT_OFFER_V2, variables, operation_name="ProductOffer")
        block = data.get("productOfferV2") or {}
        nodes = block.get("nodes") or []
        pi = block.get("pageInfo") or {}
        info = PageInfo(
            page=int(pi.get("page", page)),
            limit=int(pi.get("limit", variables["limit"])),
            has_next_page=bool(pi.get("hasNextPage", False)),
            scroll_id=pi.get("scrollId"),
        )
        return nodes, info

    def iter_product_offers(self, product_cat_id: int | None = None, max_pages: int | None = None, **kw) -> Iterator[dict[str, Any]]:
        """Walk pages of productOfferV2 (bulk feed) and yield raw nodes with their listing position."""
        max_pages = max_pages or self.settings.shopee_max_pages
        position = 0
        for page in range(1, max_pages + 1):
            nodes, info = self.product_offers_page(page=page, product_cat_id=product_cat_id, **kw)
            log.info("productOfferV2 cat=%s page=%s -> %s nodes (next=%s)", product_cat_id, page, len(nodes), info.has_next_page)
            for node in nodes:
                position += 1
                node["_position"] = position
                yield node
            if not nodes or not info.has_next_page:
                break

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "ShopeeClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
