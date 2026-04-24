#!/usr/bin/env python3
"""
Thin SQL executor for SPCS environments.
Uses snowflake-connector-python with SPCS OAuth token when available,
falls back to snow CLI otherwise.
Usage: python3 snow_sql.py "SELECT 1"
Output: JSON array of rows to stdout
"""
import json
import os
import sys
from datetime import date, datetime, time
from decimal import Decimal

SPCS_TOKEN_PATH = "/snowflake/session/token"


def _serialize(obj):
    """Handle types that json.dumps can't serialize natively."""
    if isinstance(obj, (datetime, date, time)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.hex()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

def run_via_connector(sql: str) -> list[dict]:
    import snowflake.connector
    token = open(SPCS_TOKEN_PATH).read().strip()
    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        host=os.environ["SNOWFLAKE_HOST"],
        authenticator="oauth",
        token=token,
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
        database=os.environ.get("SNOWFLAKE_DATABASE", ""),
    )
    try:
        cur = conn.cursor(snowflake.connector.DictCursor)
        cur.execute(sql)
        rows = cur.fetchall()
        # Normalize keys to lowercase to match snow CLI --format json output
        return [{k.lower(): v for k, v in r.items()} for r in rows]
    finally:
        conn.close()

def run_via_cli(sql: str) -> list[dict]:
    import subprocess
    snow = os.environ.get("SNOW_PATH", "snow")
    connection = os.environ.get("SNOW_CONNECTION", "default")
    raw = subprocess.check_output(
        [snow, "sql", "-q", sql, "-c", connection, "--format", "json"],
        text=True, timeout=30,
    )
    return json.loads(raw)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: snow_sql.py <sql>", file=sys.stderr)
        sys.exit(1)
    sql = sys.argv[1]
    try:
        if os.path.exists(SPCS_TOKEN_PATH):
            rows = run_via_connector(sql)
        else:
            rows = run_via_cli(sql)
        print(json.dumps(rows, default=_serialize))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
