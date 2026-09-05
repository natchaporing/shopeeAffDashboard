from datetime import date

from shopee_aff.mock_source import generate
from shopee_aff.normalize import normalize_offer

D = date(2026, 9, 5)


def test_normalize_offer_maps_fields_and_rates():
    node = {"itemId": "123", "shopId": 7, "productName": "Thing", "productCatIds": [100001, 200003],
            "priceMin": "99.5", "commissionRate": "0.05", "sellerCommissionRate": "5.0", "sales": "42",
            "ratingStar": "4.8", "_position": 3}
    r = normalize_offer(node, D)
    assert r.item_id == 123 and r.shop_id == 7 and r.title == "Thing"
    assert r.category == "100001" and r.category_ids == [100001, 200003]
    assert r.price == 99.5 and r.commission_rate == 0.05 and r.seller_commission_rate == 0.05
    assert r.monthly_sales == 42 and r.rating == 4.8 and r.rank == 3
    assert r.cumulative_sales is None and r.partner_count is None
    assert "_position" not in r.raw and r.raw["itemId"] == "123"


def test_mock_source_is_deterministic_and_ranked():
    a = list(generate(D, n=50))
    b = list(generate(D, n=50))
    assert a == b
    assert [n["_position"] for n in a] == list(range(1, 51))
    assert len({n["itemId"] for n in a}) == 50
    assert normalize_offer(a[0], D).rank == 1
