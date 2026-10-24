"""
Central Time & Date Service for BonCore POS.
Aligns all restaurant business day, hourly, and daily reports with the live local timezone (Europe/Istanbul, UTC+3).
"""

from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional, Dict, Any

TURKEY_OFFSET_HOURS = 3
TURKEY_TZ = timezone(timedelta(hours=TURKEY_OFFSET_HOURS))

TURKISH_DAY_NAMES = [
    "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"
]

TURKISH_MONTH_NAMES = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
]


def get_local_now() -> datetime:
    """
    Returns the current local datetime in Turkey (+03:00) as naive datetime for easy comparison.
    """
    utc_now = datetime.utcnow()
    return utc_now + timedelta(hours=TURKEY_OFFSET_HOURS)


def get_utc_now() -> datetime:
    """
    Returns the current UTC datetime (naive).
    """
    return datetime.utcnow()


def to_local_dt(utc_dt: Optional[datetime]) -> Optional[datetime]:
    """
    Converts a UTC naive datetime from database (e.g. Order.created_at) to local Turkey time.
    """
    if not utc_dt:
        return None
    return utc_dt + timedelta(hours=TURKEY_OFFSET_HOURS)


def to_utc_dt(local_dt: datetime) -> datetime:
    """
    Converts a local Turkey datetime to UTC datetime for database query matching.
    """
    return local_dt - timedelta(hours=TURKEY_OFFSET_HOURS)


def get_day_bounds_utc(date_input: Optional[Any] = None) -> Tuple[datetime, datetime]:
    """
    Given a local date (string 'YYYY-MM-DD', datetime.date, or None for today),
    returns (start_utc, end_utc) corresponding to local [00:00:00, 23:59:59.999999].

    Example:
    Local date: 2026-10-24
    Local start: 2026-10-24 00:00:00 (+03:00) => UTC: 2026-10-23 21:00:00
    Local end:   2026-10-25 00:00:00 (+03:00) => UTC: 2026-10-24 21:00:00
    """
    local_now = get_local_now()

    if date_input is None:
        y, m, d = local_now.year, local_now.month, local_now.day
    elif isinstance(date_input, str):
        try:
            parts = [int(p) for p in date_input.strip()[:10].split("-")]
            y, m, d = parts[0], parts[1], parts[2]
        except Exception:
            y, m, d = local_now.year, local_now.month, local_now.day
    elif hasattr(date_input, "year") and hasattr(date_input, "month") and hasattr(date_input, "day"):
        y, m, d = date_input.year, date_input.month, date_input.day
    else:
        y, m, d = local_now.year, local_now.month, local_now.day

    start_local = datetime(y, m, d, 0, 0, 0)
    end_local = start_local + timedelta(days=1)

    start_utc = to_utc_dt(start_local)
    end_utc = to_utc_dt(end_local)
    return start_utc, end_utc


def get_date_range_bounds_utc(
    date_range: str = "today",
    start_date_str: Optional[str] = None,
    end_date_str: Optional[str] = None
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Returns (start_utc, end_utc) for a given date_range filter keyword or custom range.
    """
    local_now = get_local_now()
    today_start_local = datetime(local_now.year, local_now.month, local_now.day, 0, 0, 0)

    if start_date_str and end_date_str:
        s_utc, _ = get_day_bounds_utc(start_date_str)
        _, e_utc = get_day_bounds_utc(end_date_str)
        return s_utc, e_utc

    range_lower = (date_range or "today").lower().strip()

    if range_lower == "today":
        return get_day_bounds_utc(local_now)
    elif range_lower == "yesterday":
        yesterday_local = today_start_local - timedelta(days=1)
        return get_day_bounds_utc(yesterday_local)
    elif range_lower == "week":
        # Last 7 calendar days including today
        week_start_local = today_start_local - timedelta(days=7)
        end_local = today_start_local + timedelta(days=1)
        return to_utc_dt(week_start_local), to_utc_dt(end_local)
    elif range_lower == "month":
        # Last 30 calendar days including today
        month_start_local = today_start_local - timedelta(days=30)
        end_local = today_start_local + timedelta(days=1)
        return to_utc_dt(month_start_local), to_utc_dt(end_local)
    elif range_lower == "all":
        return None, None
    else:
        # Default fallback to today
        return get_day_bounds_utc(local_now)


def get_live_time_info() -> Dict[str, Any]:
    """
    Returns live metadata about current restaurant time, date, day name, and timezone.
    """
    local_dt = get_local_now()
    day_idx = local_dt.weekday() # 0 is Pazartesi, 6 is Pazar
    month_idx = local_dt.month - 1

    formatted_full = f"{local_dt.day} {TURKISH_MONTH_NAMES[month_idx]} {local_dt.year}, {TURKISH_DAY_NAMES[day_idx]}"

    return {
        "server_time_iso": local_dt.isoformat(),
        "date": local_dt.strftime("%Y-%m-%d"),
        "formatted_date": local_dt.strftime("%d.%m.%Y"),
        "formatted_full": formatted_full,
        "time": local_dt.strftime("%H:%M:%S"),
        "hour_minute": local_dt.strftime("%H:%M"),
        "day_name": TURKISH_DAY_NAMES[day_idx],
        "day_of_week": day_idx,
        "timezone": "Europe/Istanbul (+03:00)"
    }
