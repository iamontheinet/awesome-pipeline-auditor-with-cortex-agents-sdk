-- ============================================================================
-- Stored procedure for processing due scheduled audits
-- ============================================================================
-- Update the fully-qualified table name below to match your AUDITOR_SCHEMA.
-- Default: PIPELINE_AUDITOR_DB.AUDITOR
-- ============================================================================

CREATE OR REPLACE PROCEDURE PIPELINE_AUDITOR_DB.AUDITOR.RUN_DUE_AUDITS()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
  LET due_count INTEGER := (
    SELECT COUNT(*)
    FROM PIPELINE_AUDITOR_DB.AUDITOR.AUDIT_SCHEDULES
    WHERE ENABLED = TRUE
      AND NEXT_RUN <= CURRENT_TIMESTAMP()
  );

  UPDATE PIPELINE_AUDITOR_DB.AUDITOR.AUDIT_SCHEDULES
  SET LAST_RUN = CURRENT_TIMESTAMP(),
      LAST_STATUS = 'running',
      NEXT_RUN = DATEADD('minute', INTERVAL_MINUTES, CURRENT_TIMESTAMP())
  WHERE ENABLED = TRUE
    AND NEXT_RUN <= CURRENT_TIMESTAMP();

  RETURN 'Processed ' || :due_count || ' due audit(s)';
END;
$$
