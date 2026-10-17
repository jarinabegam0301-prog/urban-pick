from app.repositories.base import Repository

LOW_STOCK_THRESHOLD_KEY = "low_stock_threshold"
DEFAULT_LOW_STOCK_THRESHOLD = 5


def get_low_stock_threshold(repo: Repository) -> int:
    raw = repo.get_setting(LOW_STOCK_THRESHOLD_KEY)
    try:
        return int(raw) if raw is not None else DEFAULT_LOW_STOCK_THRESHOLD
    except ValueError:
        return DEFAULT_LOW_STOCK_THRESHOLD


def set_low_stock_threshold(repo: Repository, value: int) -> None:
    repo.set_setting(LOW_STOCK_THRESHOLD_KEY, str(value))
