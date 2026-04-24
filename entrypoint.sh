#!/bin/bash
# Write connections.toml from env vars + SPCS token
mkdir -p /root/.snowflake

cat > /root/.snowflake/connections.toml << TOML
[default]
account = "sfsenorthamerica-gen_ai_hol"
host = "sfsenorthamerica-gen-ai-hol.snowflakecomputing.com"
authenticator = "oauth"
token_file_path = "/snowflake/session/token"
warehouse = "AUTOMATED_INTELLIGENCE_WH"
database = "AUTOMATED_INTELLIGENCE"

[dash-builder-si]
account = "sfsenorthamerica-gen_ai_hol"
user = "${SNOWFLAKE_PAT_USER}"
host = "sfsenorthamerica-gen-ai-hol.snowflakecomputing.com"
password = "${SNOWFLAKE_PAT_PASSWORD}"
warehouse = "AUTOMATED_INTELLIGENCE_WH"
database = "AUTOMATED_INTELLIGENCE"
schema = "RAW"
role = "snowflake_intelligence_admin"
TOML

chmod 0600 /root/.snowflake/connections.toml

exec node dist-server/index.js
