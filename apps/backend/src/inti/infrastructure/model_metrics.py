"""Numeric model telemetry; no prompts, screenshots, credentials or responses."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from time import time


class ModelMetricsStore:
    def __init__(self, root: Path) -> None:
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "model-metrics.sqlite3"
        with self.connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS calls (
                id INTEGER PRIMARY KEY, model TEXT NOT NULL, recorded_at REAL NOT NULL,
                duration REAL NOT NULL, ok INTEGER NOT NULL, tokens INTEGER,
                source TEXT NOT NULL, grounding_hit INTEGER, http_status INTEGER
            )""")

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    def record(
        self,
        model: str,
        duration: float,
        ok: bool,
        tokens: int | None,
        source: str,
        grounding_hit: bool | None = None,
        http_status: int | None = None,
    ) -> int:
        with self.connect() as db:
            cursor = db.execute(
                "INSERT INTO calls VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    model,
                    time(),
                    max(duration, 0.000001),
                    int(ok),
                    tokens,
                    source,
                    None if grounding_hit is None else int(grounding_hit),
                    http_status,
                ),
            )
            return int(cursor.lastrowid or 0)

    def summary(self, model: str) -> dict:
        with self.connect() as db:
            rows = db.execute(
                "SELECT recorded_at,duration,ok,tokens,grounding_hit,http_status FROM calls "
                "WHERE model=? AND source='live' ORDER BY id DESC LIMIT 200",
                (model,),
            ).fetchall()
        successes = [row for row in rows if row[2]]
        usage = [row for row in successes if row[3] is not None]
        grounding = [row[4] for row in successes if row[4] is not None]
        return {
            "attempts": len(rows),
            "successful_calls": len(successes),
            "failed_calls": len(rows) - len(successes),
            "mean_latency_ms": sum(row[1] for row in successes) * 1000 / len(successes)
            if successes
            else None,
            "output_tokens_per_second": sum(row[3] for row in usage) / sum(row[1] for row in usage)
            if usage
            else None,
            "token_samples": len(usage),
            "grounding_samples": len(grounding),
            "grounding_hit_rate": sum(grounding) / len(grounding) if grounding else None,
            "last_at": rows[0][0] if rows else None,
            "last_ok": bool(rows[0][2]) if rows else None,
            "last_http_status": rows[0][5] if rows else None,
            "gpu_memory_bytes": None,
            "window_limit": 200,
        }
