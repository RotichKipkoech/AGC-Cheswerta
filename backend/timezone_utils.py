from datetime import datetime, date
from zoneinfo import ZoneInfo

NAIROBI = ZoneInfo("Africa/Nairobi")


def nairobi_now() -> datetime:
    """Current Nairobi wall-clock time, as a naive datetime (no tzinfo) so
    it compares/stores cleanly against the existing naive DateTime columns."""
    return datetime.now(NAIROBI).replace(tzinfo=None)


def nairobi_today() -> date:
    """Current Nairobi calendar date."""
    return nairobi_now().date()


def to_nairobi_naive(dt: datetime) -> datetime:
    """Normalize any datetime (naive-assumed-UTC, or tz-aware) into a naive
    Nairobi wall-clock datetime, for comparing against stored columns.
    Naive input is assumed to already be UTC (matches how this app used to
    store timestamps via datetime.utcnow(), and how 'Z'-suffixed ISO strings
    from the frontend are parsed)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(NAIROBI).replace(tzinfo=None)