"""Deterministic synthetic product feed for development without API credentials.

Emits productOfferV2-shaped nodes so the whole pipeline (normalise -> store ->
metrics -> signals -> dashboard) runs identically against fake or live data. Ranks
drift day over day so velocity / acceleration / Rocket signals appear naturally.
"""
from __future__ import annotations

import random
from datetime import date
from typing import Any, Iterator

_EPOCH = date(2026, 1, 1)
_CATS = [100001, 100630, 100636, 100010, 100017, 100533, 100639, 100629]
_WORDS = ["Wireless", "Mini", "Pro", "Ultra", "Portable", "LED", "Smart", "Foldable", "Ceramic", "Bamboo",
          "Earbuds", "Blender", "Serum", "Tripod", "Charger", "Lamp", "Organizer", "Kettle", "Mat", "Brush"]


def _pool(n: int) -> list[dict[str, Any]]:
    rng = random.Random(42)
    items = []
    for i in range(n):
        base_rank = i + 1
        trend = rng.choice([-1.5, -0.8, -0.3, 0.0, 0.0, 0.0, 0.3, 0.8, 1.5, 3.0])  # ranks/day (negative = climbing)
        items.append(
            {
                "itemId": 20_000_000_000 + i,
                "shopId": 300_000 + rng.randint(1, 400),
                "productName": " ".join(rng.sample(_WORDS, 3)) + f" #{i}",
                "shopName": f"shop{rng.randint(1, 400)}",
                "shopType": rng.choice([["1"], ["2"], ["4"]]),
                "productCatIds": [rng.choice(_CATS), rng.randint(200000, 209999)],
                "priceMin": round(rng.uniform(49, 2500), 2),
                "commissionRate": round(rng.choice([0.02, 0.03, 0.05, 0.08, 0.10, 0.15, 0.20]), 4),
                "ratingStar": round(rng.uniform(4.0, 5.0), 1),
                "baseSales": int(rng.lognormvariate(6.0, 1.0)),
                "cumulativeSales": int(rng.lognormvariate(8.0, 1.2)),
                "partnerCount": rng.choice([0, 0, 1, 2, 3, 5, 8, 13, 21, 40]),
                "baseRank": base_rank,
                "trend": trend,
            }
        )
    return items


def generate(snapshot_date: date, n: int = 300) -> Iterator[dict[str, Any]]:
    t = (snapshot_date - _EPOCH).days
    rng = random.Random(f"{snapshot_date.isoformat()}")
    scored = []
    for it in _pool(n):
        noise = rng.gauss(0, 2.0)
        score = it["baseRank"] + it["trend"] * t + noise
        # periodic "surge": a handful of mid-table items jump into the top-10 for a few days
        if (it["itemId"] * 7 + t // 4) % 60 == 0:
            score -= 400
        scored.append((score, it))
    scored.sort(key=lambda x: x[0])
    for pos, (_, it) in enumerate(scored, start=1):
        sales = max(0, int(it["baseSales"] * rng.uniform(0.7, 1.3)))
        node = {
            "itemId": it["itemId"],
            "shopId": it["shopId"],
            "productName": it["productName"],
            "shopName": it["shopName"],
            "shopType": it["shopType"],
            "productCatIds": it["productCatIds"],
            "priceMin": it["priceMin"],
            "priceMax": round(it["priceMin"] * 1.2, 2),
            "priceDiscountRate": rng.choice([0, 0, 10, 20, 35]),
            "commissionRate": str(it["commissionRate"]),
            "sellerCommissionRate": str(round(it["commissionRate"] * 0.6, 4)),
            "shopeeCommissionRate": str(round(it["commissionRate"] * 0.4, 4)),
            "commission": str(round(it["priceMin"] * it["commissionRate"], 2)),
            "sales": sales,
            "cumulativeSales": it["cumulativeSales"] + sales * max(t, 0) // 30,
            "partnerCount": it["partnerCount"],
            "ratingStar": str(it["ratingStar"]),
            "imageUrl": f"https://cf.shopee.example/{it['itemId']}.jpg",
            "productLink": f"https://shopee.example/product/{it['shopId']}/{it['itemId']}",
            "offerLink": f"https://s.shopee.example/{it['itemId']}",
            "periodStartTime": 0,
            "periodEndTime": 0,
            "_position": pos,
        }
        yield node
