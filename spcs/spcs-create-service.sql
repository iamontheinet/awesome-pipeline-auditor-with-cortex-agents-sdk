-- ============================================================================
-- SPCS Create Service
-- ============================================================================
-- Execute this file using Snow CLI:
--   snow sql -c your-snowcli-connection-name -f spcs/spcs-create-service.sql
-- ============================================================================

USE DATABASE AUDITOR_SPCS;
USE SCHEMA APPS;

-- Check if spec.yaml exists in stage
LIST @SPECS;

-- Check if Docker image exists in repository
SHOW IMAGES IN IMAGE REPOSITORY AUDITOR_REPO;

-- Create the service
CREATE SERVICE IF NOT EXISTS PIPELINE_AUDITOR_SERVICE
  IN COMPUTE POOL AUDITOR_POOL
  FROM @SPECS
  SPECIFICATION_FILE = 'spcs-spec.yaml'
  MIN_INSTANCES = 1
  MAX_INSTANCES = 1
  EXTERNAL_ACCESS_INTEGRATIONS = (ALLOW_ALL_INTEGRATION)
  COMMENT = 'Pipeline Auditor — powered by Cortex Code Agent SDK';

-- Wait for service to initialize
CALL SYSTEM$WAIT(5);

-- Check service status
DESCRIBE SERVICE PIPELINE_AUDITOR_SERVICE;

-- View service logs (last 100 lines)
CALL SYSTEM$GET_SERVICE_LOGS('PIPELINE_AUDITOR_SERVICE', '0', 'auditor', 100);

-- View service endpoints
SHOW ENDPOINTS IN SERVICE PIPELINE_AUDITOR_SERVICE;
