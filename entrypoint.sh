#!/bin/bash
# Write connections.toml from env vars + SPCS token
mkdir -p /root/.snowflake

ACCT="${SNOWFLAKE_ACCOUNT:?SNOWFLAKE_ACCOUNT env var required}"
HOST="${SNOWFLAKE_HOST:?SNOWFLAKE_HOST env var required}"
WH="${SNOWFLAKE_WAREHOUSE:-COMPUTE_WH}"
DB="${SNOWFLAKE_DATABASE:-}"
PAT_USER="${SNOWFLAKE_PAT_USER:?SNOWFLAKE_PAT_USER env var required}"
PAT_PASS="${SNOWFLAKE_PAT_PASSWORD:?SNOWFLAKE_PAT_PASSWORD env var required}"
PAT_ROLE="${SNOWFLAKE_PAT_ROLE:-}"

cat > /root/.snowflake/connections.toml << TOML
[default]
account = "${ACCT}"
host = "${HOST}"
authenticator = "oauth"
token_file_path = "/snowflake/session/token"
warehouse = "${WH}"
database = "${DB}"

[pat]
account = "${ACCT}"
user = "${PAT_USER}"
host = "${HOST}"
password = "${PAT_PASS}"
warehouse = "${WH}"
database = "${DB}"
role = "${PAT_ROLE}"
TOML

chmod 0600 /root/.snowflake/connections.toml

exec node dist-server/index.js
