"""GraphQL documents for the Shopee Affiliate Open API.

Keep every query string here so a field rename on Shopee's side is a one-file fix.
"""

# Product discovery. Fields verified against the public Open API schema; anything
# Shopee removes will surface as a GraphQL error from probe_api.py, not a silent None.
PRODUCT_OFFER_V2 = """
query ProductOffer($listType: Int, $sortType: Int, $page: Int, $limit: Int,
                   $productCatId: Int, $keyword: String, $shopId: Int64, $itemId: Int64) {
  productOfferV2(listType: $listType, sortType: $sortType, page: $page, limit: $limit,
                 productCatId: $productCatId, keyword: $keyword, shopId: $shopId, itemId: $itemId) {
    nodes {
      itemId
      shopId
      productName
      shopName
      shopType
      productCatIds
      priceMin
      priceMax
      priceDiscountRate
      commissionRate
      sellerCommissionRate
      shopeeCommissionRate
      commission
      sales
      ratingStar
      imageUrl
      productLink
      offerLink
      periodStartTime
      periodEndTime
    }
    pageInfo {
      page
      limit
      hasNextPage
      scrollId
    }
  }
}
"""

# Minimal query used by the probe to prove auth works before anything else.
PING = """
query Ping {
  productOfferV2(page: 1, limit: 1) {
    nodes { itemId productName }
    pageInfo { page limit hasNextPage }
  }
}
"""

# Schema introspection: lists every root query field + args so we can confirm
# which "feed"-style queries the region actually exposes (e.g. a bulk item feed).
INTROSPECT_ROOT = """
query Introspect {
  __schema {
    queryType {
      fields {
        name
        description
        args { name type { name kind ofType { name kind } } }
        type { name kind ofType { name kind } }
      }
    }
  }
}
"""

INTROSPECT_TYPE = """
query IntrospectType($name: String!) {
  __type(name: $name) {
    name
    kind
    fields { name type { name kind ofType { name kind ofType { name kind } } } }
  }
}
"""
