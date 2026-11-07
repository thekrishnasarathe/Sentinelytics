"""
SQLite Database Manager for Sentinelytics Historical Runs & Multi-Comparison:
Persists complete CachedReport objects into SQLite `sentiment_hub.db`.
Enables instant retrieval, history views, and side-by-side comparison.
"""

import json
import sqlite3
import logging
from pathlib import Path
from typing import List, Optional, Dict, Any
from .schemas import CachedReport

logger = logging.getLogger("sentiment_history_db")

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "sentiment_hub.db"


class HistoryDB:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self.init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        """Creates the analysis_history table if it doesn't already exist."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS analysis_history (
                        post_id TEXT PRIMARY KEY,
                        post_url TEXT,
                        platform TEXT,
                        model_used TEXT,
                        total_comments INTEGER,
                        positive_pct REAL,
                        negative_pct REAL,
                        neutral_pct REAL,
                        generated_at TEXT,
                        high_negative_alert INTEGER,
                        executive_summary TEXT,
                        report_json TEXT
                    )
                    """
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_history_platform ON analysis_history (platform)"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_history_generated_at ON analysis_history (generated_at DESC)"
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to initialize HistoryDB at {self.db_path}: {e}")

    def save_report_to_db(self, report: CachedReport) -> bool:
        """Atomically upserts a CachedReport into SQLite."""
        try:
            # Extract percentages from breakdown
            pos_pct = 0.0
            neg_pct = 0.0
            neu_pct = 0.0
            for row in report.breakdown:
                if row.category == "Positive":
                    pos_pct = row.percentage
                elif row.category == "Negative":
                    neg_pct = row.percentage
                elif row.category == "Neutral":
                    neu_pct = row.percentage

            report_json_str = report.model_dump_json()

            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO analysis_history (
                        post_id,
                        post_url,
                        platform,
                        model_used,
                        total_comments,
                        positive_pct,
                        negative_pct,
                        neutral_pct,
                        generated_at,
                        high_negative_alert,
                        executive_summary,
                        report_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        report.post_id,
                        report.post_url,
                        report.platform,
                        report.model_used,
                        report.total_valid_comments,
                        pos_pct,
                        neg_pct,
                        neu_pct,
                        report.generated_at,
                        1 if report.high_negative_alert else 0,
                        report.executive_summary or "",
                        report_json_str,
                    ),
                )
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error saving report {report.post_id} to SQLite: {e}")
            return False

    def get_all_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns metadata list of past analyses ordered by recency."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT 
                        post_id,
                        post_url,
                        platform,
                        model_used,
                        total_comments,
                        positive_pct,
                        negative_pct,
                        neutral_pct,
                        generated_at,
                        high_negative_alert,
                        executive_summary
                    FROM analysis_history
                    ORDER BY generated_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
                rows = cursor.fetchall()
                results = []
                for r in rows:
                    results.append({
                        "post_id": r["post_id"],
                        "post_url": r["post_url"],
                        "platform": r["platform"],
                        "model_used": r["model_used"],
                        "total_comments": r["total_comments"],
                        "positive_pct": float(r["positive_pct"] or 0.0),
                        "negative_pct": float(r["negative_pct"] or 0.0),
                        "neutral_pct": float(r["neutral_pct"] or 0.0),
                        "generated_at": r["generated_at"],
                        "high_negative_alert": bool(r["high_negative_alert"]),
                        "executive_summary": r["executive_summary"],
                    })
                return results
        except Exception as e:
            logger.error(f"Error fetching history from SQLite: {e}")
            return []

    def get_report_by_id(self, post_id: str) -> Optional[CachedReport]:
        """Loads and deserializes full CachedReport from SQLite."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT report_json FROM analysis_history WHERE post_id = ? LIMIT 1",
                    (post_id,),
                )
                row = cursor.fetchone()
                if row and row["report_json"]:
                    data = json.loads(row["report_json"])
                    return CachedReport.model_validate(data)
        except Exception as e:
            logger.error(f"Error fetching report {post_id} from SQLite: {e}")
        return None

    def delete_history_item(self, post_id: str) -> bool:
        """Deletes a report from SQLite history."""
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM analysis_history WHERE post_id = ?", (post_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Error deleting history item {post_id}: {e}")
            return False

