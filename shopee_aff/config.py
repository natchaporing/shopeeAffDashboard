"""Settings loaded from environment / .env (pydantic-settings)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Shopee Open API
    shopee_app_id: str = ""
    shopee_app_secret: str = ""
    shopee_region: str = "co.th"
    shopee_endpoint: str = ""
    shopee_signature_mode: Literal["sha256", "hmac"] = "sha256"
    shopee_timeout_seconds: float = 30.0

    # Discovery
    shopee_list_type: int = 2
    shopee_sort_type: int = 5
    shopee_page_size: int = Field(default=50, ge=1, le=50)
    shopee_max_pages: int = Field(default=20, ge=1)
    shopee_category_ids: str = ""
    shopee_mock: bool = False

    # Storage
    database_url: str = "postgresql://postgres:postgres@localhost:5432/shopee_aff"

    # Scheduler
    ingest_enabled: bool = True
    ingest_hour: int = Field(default=6, ge=0, le=23)
    ingest_minute: int = Field(default=30, ge=0, le=59)

    # Metric windows / thresholds
    velocity_window_days: int = Field(default=3, ge=1)
    rocket_top_n: int = 10
    hidden_min_monthly_sales: int = 500
    hidden_min_gap_percentile: float = 80.0
    proven_min_cumulative_sales: int = 10_000
    proven_min_rating: float = 4.8
    rising_min_velocity: float = 3.0
    fading_max_velocity: float = -3.0

    @property
    def endpoint(self) -> str:
        if self.shopee_endpoint:
            return self.shopee_endpoint
        return f"https://open-api.affiliate.shopee.{self.shopee_region}/graphql"

    @property
    def category_ids(self) -> list[int]:
        return [int(x) for x in self.shopee_category_ids.split(",") if x.strip()]

    @property
    def has_credentials(self) -> bool:
        return bool(self.shopee_app_id and self.shopee_app_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
