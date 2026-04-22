import {
  Box,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { AuditHeader, type AuditScope } from "./AuditHeader";
import { AuditSidebar } from "./AuditSidebar";
import { ChatThread } from "./ChatThread";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { useAudit } from "../hooks/useAudit";
import { useCallback } from "react";

export function AuditDashboard() {
  const theme = useTheme();

  const {
    isAuditing,
    isLoading,
    report,
    messages,
    toolProgress,
    error,
    stats,
    startAudit,
    sendMessage,
    cancelAudit,
  } = useAudit();

  const handleStartAudit = (database: string, connection?: string) => {
    startAudit(database, connection || "dash-builder-si", [], "");
  };

  const downloadReport = useCallback(() => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const ts = report.audit_timestamp?.replace(/[:.]/g, "-") || Date.now();
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${report.database}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const hasAuditData = isAuditing || report || toolProgress.length > 0;
  const showSidebar = hasAuditData;

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: theme.palette.background.default,
      }}
    >
      <AuditHeader
        onStartAudit={(db, conn, scope, schema) => startAudit(db, conn, scope, schema)}
        onCancel={cancelAudit}
        isLoading={isLoading}
        isAuditing={isAuditing}
      />

      {/* Main content area */}
      <Box sx={{ flex: 1, overflow: "hidden", display: "flex" }}>
        {!hasAuditData ? (
          <Box sx={{ flex: 1 }}>
            <EmptyState onStartAudit={(db) => handleStartAudit(db)} />
          </Box>
        ) : (
          <>
            {/* Chat column */}
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              {/* Chat thread with inline report accordion */}
              <Box sx={{ flex: 1, overflow: "auto" }}>
                <ChatThread messages={messages} report={report} toolProgress={toolProgress} isLoading={isLoading} onDownload={downloadReport} />
              </Box>

              {/* Error display */}
              {error && (
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "error.main",
                      display: "block",
                      p: 1,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.error.main, 0.08),
                    }}
                  >
                    {error}
                  </Typography>
                </Box>
              )}

              {/* Chat input */}
              {hasAuditData && (
                <ChatInput
                  onSend={sendMessage}
                  disabled={isLoading}
                  placeholder={
                    report
                      ? "Ask about any finding, table, or pipeline issue..."
                      : "Waiting for audit to complete..."
                  }
                />
              )}
            </Box>

            {/* Real-time stats sidebar */}
            {showSidebar && (
              <AuditSidebar
                toolProgress={toolProgress}
                report={report}
                stats={stats}
                isLoading={isLoading}
              />
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
