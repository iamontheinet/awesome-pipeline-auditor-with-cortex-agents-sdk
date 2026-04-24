-- ============================================================================
-- App Database Setup
-- ============================================================================
-- Creates the database, schema, and tables used by the Pipeline Auditor
-- for storing audit schedules and results.
--
-- Execute using Snow CLI:
--   snow sql -c your-connection-name -f sql/setup.sql
--
-- Or run individual statements in Snowsight.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS PIPELINE_AUDITOR_DB;
CREATE SCHEMA IF NOT EXISTS PIPELINE_AUDITOR_DB.AUDITOR;

-- Schedule tracking table
CREATE TABLE IF NOT EXISTS PIPELINE_AUDITOR_DB.AUDITOR.AUDIT_SCHEDULES (
  ID STRING DEFAULT UUID_STRING(),
  DATABASE STRING,
  SCHEMA STRING,
  CONNECTION STRING,
  SCOPE ARRAY,
  CRON_LABEL STRING,
  INTERVAL_MINUTES NUMBER,
  SEND_EMAIL BOOLEAN DEFAULT FALSE,
  ENABLED BOOLEAN DEFAULT TRUE,
  CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  LAST_RUN TIMESTAMP_TZ,
  NEXT_RUN TIMESTAMP_TZ,
  LAST_STATUS STRING
);

-- Audit results table
CREATE TABLE IF NOT EXISTS PIPELINE_AUDITOR_DB.AUDITOR.AUDIT_RESULTS (
  ID STRING DEFAULT UUID_STRING(),
  DATABASE STRING,
  SCHEMA STRING,
  SCOPE ARRAY,
  REPORT VARIANT,
  DURATION_MS NUMBER,
  TOOL_CALLS NUMBER,
  FINDINGS_COUNT NUMBER,
  SCHEDULE_ID STRING,
  CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);
