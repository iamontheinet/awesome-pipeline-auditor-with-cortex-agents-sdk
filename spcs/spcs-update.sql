-- ============================================================================
-- SPCS Service Update (Retains Endpoint URL)
-- ============================================================================
-- Execute this file AFTER:
--   1. Building and pushing new Docker image
--   2. Uploading updated spcs-spec.yaml (if changed)
--
-- Execute using Snow CLI:
--   snow sql -c your-snowcli-connection-name -f spcs/spcs-update.sql
--
-- This approach RETAINS the original endpoint URL (unlike DROP/CREATE).
-- ============================================================================

USE DATABASE AUDITOR_SPCS;
USE SCHEMA APPS;

-- Suspend the service
ALTER SERVICE PIPELINE_AUDITOR_SERVICE SUSPEND;

-- Update service with new/same spec/image
ALTER SERVICE PIPELINE_AUDITOR_SERVICE FROM @SPECS SPECIFICATION_FILE = 'spcs-spec.yaml';

-- Resume the service
ALTER SERVICE PIPELINE_AUDITOR_SERVICE RESUME;

-- Wait for service to start
CALL SYSTEM$WAIT(5);

-- Check service status
DESCRIBE SERVICE PIPELINE_AUDITOR_SERVICE;

-- View service endpoints (should be the same as before)
SHOW ENDPOINTS IN SERVICE PIPELINE_AUDITOR_SERVICE;
