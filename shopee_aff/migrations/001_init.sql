-- One row per (item_id, snapshot_date). Raw snapshot straight from the API.
CREATE TABLE IF NOT EXISTS product_snapshots (
    item_id                 BIGINT      NOT NULL,
    snapshot_date           DATE        NOT NULL,
    shop_id                 BIGINT,
    title                   TEXT        NOT NULL DEFAULT '',
    shop_name               TEXT,
    category                TEXT,
    category_ids            INTEGER[]   NOT NULL DEFAULT '{}',
    price                   NUMERIC(14,2),
    price_max               NUMERIC(14,2),
    discount_rate           NUMERIC(6,2),
    commission_rate         NUMERIC(8,5),
    seller_commission_rate  NUMERIC(8,5),
    shopee_commission_rate  NUMERIC(8,5),
    monthly_sales           INTEGER,
    cumulative_sales        BIGINT,
    rating                  NUMERIC(4,2),
    partner_count           INTEGER,
    rank                    INTEGER,
    image_url               TEXT,
    product_link            TEXT,
    offer_link              TEXT,
    raw                     JSONB,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_date       ON product_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_item_date  ON product_snapshots (item_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_category   ON product_snapshots (snapshot_date, category);

-- Derived metrics, recomputed for a day from that day's rows + history.
CREATE TABLE IF NOT EXISTS product_metrics (
    item_id              BIGINT       NOT NULL,
    snapshot_date        DATE         NOT NULL,
    est_monthly_revenue  NUMERIC(16,2),
    gap_score            NUMERIC(12,4),
    gap_percentile       NUMERIC(6,2),
    angel_score          NUMERIC(6,2),
    rank_velocity        NUMERIC(10,2),
    rank_acceleration    NUMERIC(10,2),
    headroom             INTEGER,
    breakout_score       NUMERIC(6,2),
    history_days         INTEGER      NOT NULL DEFAULT 1,
    signal               TEXT         NOT NULL DEFAULT 'Single',
    computed_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, snapshot_date),
    FOREIGN KEY (item_id, snapshot_date) REFERENCES product_snapshots (item_id, snapshot_date) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metrics_date_signal ON product_metrics (snapshot_date, signal);

-- Audit trail for every pull.
CREATE TABLE IF NOT EXISTS ingest_runs (
    id            BIGSERIAL    PRIMARY KEY,
    snapshot_date DATE         NOT NULL,
    source        TEXT         NOT NULL,
    started_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    status        TEXT         NOT NULL DEFAULT 'running',
    rows_written  INTEGER      NOT NULL DEFAULT 0,
    error         TEXT
);

-- Convenience view: snapshot + metrics for the same day.
CREATE OR REPLACE VIEW product_day AS
SELECT s.*,
       m.est_monthly_revenue, m.gap_score, m.gap_percentile, m.angel_score,
       m.rank_velocity, m.rank_acceleration, m.headroom, m.breakout_score,
       m.history_days, m.signal
FROM product_snapshots s
LEFT JOIN product_metrics m USING (item_id, snapshot_date);
