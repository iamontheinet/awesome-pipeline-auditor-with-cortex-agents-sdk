import { useState, useCallback, useRef, useEffect } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tab,
  Tabs,
  Toolbar,
  Typography,
  alpha,
  useTheme,
  type Theme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  History as HistoryIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  PauseCircle as PausedIcon,
  Download as DownloadIcon,
  MailOutline as MailIcon,
} from "@mui/icons-material";
import { useScheduler, SCHEDULE_PRESETS } from "../hooks/useScheduler";
import type { AuditSchedule } from "../hooks/useScheduler";
import { useAuditHistory } from "../hooks/useAuditHistory";
import type { AuditResult } from "../hooks/useAuditHistory";
import { ReportPanel } from "./ReportPanel";
import type { AuditReport } from "../types";

const MIN_WIDTH = 340;

function getScrollbarSx(theme: Theme) {
  const thumb = alpha(theme.palette.text.primary, 0.1);
  const thumbHover = alpha(theme.palette.text.primary, 0.2);
  return {
    "&::-webkit-scrollbar": { width: 6 },
    "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
    "&::-webkit-scrollbar-thumb": {
      bgcolor: thumb,
      borderRadius: 3,
      "&:hover": { bgcolor: thumbHover },
    },
    scrollbarWidth: "thin" as const,
    scrollbarColor: `${thumb} transparent`,
  };
}

interface SchedulePanelProps {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return iso;
  const diffMs = then - now;
  const absDiff = Math.abs(diffMs);
  const future = diffMs > 0;

  if (absDiff < 60_000) return future ? "in <1m" : "<1m ago";
  if (absDiff < 3_600_000) {
    const m = Math.round(absDiff / 60_000);
    return future ? `in ${m}m` : `${m}m ago`;
  }
  if (absDiff < 86_400_000) {
    const h = Math.round(absDiff / 3_600_000);
    return future ? `in ${h}h` : `${h}h ago`;
  }
  const d = Math.round(absDiff / 86_400_000);
  return future ? `in ${d}d` : `${d}d ago`;
}

function intervalLabel(minutes: number): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.intervalMinutes === minutes);
  if (preset) return preset.label;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = secs / 60;
  return `${mins.toFixed(1)}m`;
}

// ---------------------------------------------------------------------------
// Upcoming schedule card
// ---------------------------------------------------------------------------
function UpcomingCard({
  schedule,
  theme,
  onToggle,
  onDelete,
  toggling,
  deleting,
  busy,
}: {
  schedule: AuditSchedule;
  theme: Theme;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
  busy: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        bgcolor: alpha(theme.palette.background.paper, 0.6),
        border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
        borderRadius: 1.5,
        opacity: schedule.enabled ? 1 : 0.5,
        transition: "opacity 0.2s",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }} noWrap>
          {schedule.database}
        </Typography>
        <Chip
          label={schedule.enabled ? "Active" : "Paused"}
          size="small"
          icon={schedule.enabled ? <ScheduleIcon sx={{ fontSize: 14 }} /> : <PausedIcon sx={{ fontSize: 14 }} />}
          sx={{
            height: 20,
            fontSize: "0.65rem",
            bgcolor: schedule.enabled
              ? alpha(theme.palette.success.main, 0.12)
              : alpha(theme.palette.warning.main, 0.12),
            color: schedule.enabled ? theme.palette.success.main : theme.palette.warning.main,
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
        {schedule.schema || "All schemas"} &middot; {intervalLabel(schedule.intervalMinutes)}
      </Typography>
      {schedule.enabled && schedule.nextRun && (
        <Typography variant="caption" color="primary.main" sx={{ display: "block", fontSize: "0.7rem", mt: 0.25 }}>
          Next: {relativeTime(schedule.nextRun)}
        </Typography>
      )}
      {/* Controls row */}
      <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5} sx={{ mt: 0.75 }}>
        {toggling ? (
          <CircularProgress size={20} sx={{ mx: 1 }} />
        ) : (
          <Switch
            size="small"
            checked={schedule.enabled}
            onChange={onToggle}
            disabled={busy}
          />
        )}
        {deleting ? (
          <CircularProgress size={18} sx={{ mx: 0.5 }} />
        ) : (
          <IconButton
            size="small"
            onClick={onDelete}
            disabled={busy}
            sx={{
              color: "text.disabled",
              "&:hover": { color: theme.palette.error.main },
            }}
          >
            <DeleteIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Past result card
// ---------------------------------------------------------------------------
function PastCard({
  result,
  theme,
  onClick,
}: {
  result: AuditResult;
  theme: Theme;
  onClick: () => void;
}) {
  const hasFindings = result.findingsCount > 0;
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 1.5,
        bgcolor: alpha(theme.palette.background.paper, 0.6),
        border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
        borderRadius: 1.5,
        cursor: "pointer",
        transition: "border-color 0.15s, background-color 0.15s",
        "&:hover": {
          borderColor: alpha(theme.palette.primary.main, 0.4),
          bgcolor: alpha(theme.palette.background.paper, 0.9),
        },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }} noWrap>
          {result.database}
        </Typography>
        <Chip
          label={`${result.findingsCount} finding${result.findingsCount !== 1 ? "s" : ""}`}
          size="small"
          icon={hasFindings ? <ErrorIcon sx={{ fontSize: 14 }} /> : <CheckIcon sx={{ fontSize: 14 }} />}
          sx={{
            height: 20,
            fontSize: "0.65rem",
            bgcolor: hasFindings
              ? alpha(theme.palette.warning.main, 0.12)
              : alpha(theme.palette.success.main, 0.12),
            color: hasFindings ? theme.palette.warning.main : theme.palette.success.main,
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
        {result.schema || "All schemas"} &middot; {formatDuration(result.durationMs)} &middot; {result.toolCalls} tools
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.7rem", mt: 0.25 }}>
        {relativeTime(result.createdAt)}
      </Typography>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog for past audit
// ---------------------------------------------------------------------------
function AuditDetailDialog({
  open,
  onClose,
  resultId,
}: {
  open: boolean;
  onClose: () => void;
  resultId: string | null;
}) {
  const theme = useTheme();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [meta, setMeta] = useState<{ database: string; schema: string; createdAt: string; durationMs: number; findingsCount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const handleDownload = useCallback(() => {
    if (!report) return;
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const ts = report.audit_timestamp?.replace(/[:.]/g, "-") || Date.now();
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${meta?.database || "report"}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, meta?.database]);

  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent">("idle");

  const handleEmail = useCallback(async () => {
    if (!report || !meta || emailState === "sending") return;
    setEmailState("sending");
    try {
      await fetch("/api/audit/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          report,
          database: meta.database,
          schema: meta.schema || "",
          durationMs: meta.durationMs || 0,
          toolCalls: 0,
        }),
      });
      setEmailState("sent");
      setTimeout(() => setEmailState("idle"), 3000);
    } catch (err) {
      console.error("Failed to email report:", err);
      setEmailState("idle");
    }
  }, [report, meta, emailState]);

  useEffect(() => {
    if (!resultId || !open) {
      setReport(null);
      setMeta(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/audit/history/${resultId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const row = data.result;
        // report may be a string (JSON) or already parsed object
        const raw = row.report ?? row.REPORT;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        setReport(parsed as AuditReport);
        setMeta({
          database: String(row.database ?? row.DATABASE ?? ""),
          schema: String(row.schema ?? row.SCHEMA ?? ""),
          createdAt: String(row.created_at ?? row.CREATED_AT ?? ""),
          durationMs: Number(row.duration_ms ?? row.DURATION_MS ?? 0),
          findingsCount: Number(row.findings_count ?? row.FINDINGS_COUNT ?? 0),
        });
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [resultId, open]);

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <AppBar
        sx={{
          position: "relative",
          bgcolor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          backgroundImage: "none",
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
        }}
        elevation={0}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <IconButton edge="start" onClick={onClose} sx={{ color: "text.primary" }}>
            <CloseIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            {meta?.database ?? "Audit Report"}
            {meta?.schema ? ` / ${meta.schema}` : ""}
          </Typography>
           {meta && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                label={`${meta.findingsCount} finding${meta.findingsCount !== 1 ? "s" : ""}`}
                size="small"
                sx={{ fontSize: "0.75rem", height: 24 }}
              />
              <Chip
                label={formatDuration(meta.durationMs)}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.75rem", height: 24 }}
              />
              <Typography variant="caption" color="text.secondary">
                {relativeTime(meta.createdAt)}
              </Typography>
            </Stack>
          )}
          {report && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                onClick={handleDownload}
                sx={{
                  textTransform: "none",
                  fontSize: "0.75rem",
                  borderRadius: 1.5,
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                Download
              </Button>
              <Button
                variant="outlined"
                size="small"
                disabled={emailState === "sending"}
                startIcon={
                  emailState === "sending" ? (
                    <CircularProgress size={14} color="inherit" />
                  ) : emailState === "sent" ? (
                    <CheckIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <MailIcon sx={{ fontSize: 16 }} />
                  )
                }
                onClick={handleEmail}
                sx={{
                  textTransform: "none",
                  fontSize: "0.75rem",
                  borderRadius: 1.5,
                  borderColor: emailState === "sent"
                    ? theme.palette.success.main
                    : alpha(theme.palette.primary.main, 0.3),
                  color: emailState === "sent" ? theme.palette.success.main : undefined,
                  "&:hover": { borderColor: emailState === "sent" ? theme.palette.success.main : "primary.main" },
                }}
              >
                Email
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, overflow: "auto", ...getScrollbarSx(theme) }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress size={32} />
          </Box>
        )}
        {error && (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}
        {report && <ReportPanel report={report} />}
      </Box>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Drag handle hook
// ---------------------------------------------------------------------------
function useDragResize(
  width: number,
  onWidthChange: (w: number) => void,
) {
  const dragging = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const maxW = Math.floor(window.innerWidth * 0.5);
        const newWidth = Math.max(MIN_WIDTH, Math.min(maxW, window.innerWidth - ev.clientX));
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onWidthChange],
  );

  return onMouseDown;
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function SchedulePanel({ open, onClose, width, onWidthChange }: SchedulePanelProps) {
  const theme = useTheme();
  const [tab, setTab] = useState(0);

  // Scheduler data + mutations
  const { schedules, loading: schedulesLoading, toggleSchedule, removeSchedule } = useScheduler();
  const { results, loading: historyLoading } = useAuditHistory();

  // Per-item loading state (same pattern as ScheduleDialog)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const busy = togglingIds.size > 0 || deletingIds.size > 0;

  const handleToggle = useCallback(async (id: string) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await toggleSchedule(id);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [toggleSchedule]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await removeSchedule(id);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [removeSchedule]);

  // Detail dialog state
  const [detailId, setDetailId] = useState<string | null>(null);

  // Drag resize
  const onDragStart = useDragResize(width, onWidthChange);

  const enabledSchedules = schedules
    .filter((s) => s.enabled)
    .sort((a, b) => new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime());
  const disabledSchedules = schedules.filter((s) => !s.enabled);
  const sortedSchedules = [...enabledSchedules, ...disabledSchedules];

  return (
    <>
      <Drawer
        variant="persistent"
        anchor="right"
        open={open}
        sx={{
          width: open ? width : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width,
            position: "relative",
            border: "none",
            borderLeft: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
            bgcolor: theme.palette.background.default,
            overflow: "visible",
          },
        }}
      >
        {/* Drag handle */}
        <Box
          onMouseDown={onDragStart}
          sx={{
            position: "absolute",
            top: 0,
            left: -3,
            width: 6,
            height: "100%",
            cursor: "col-resize",
            zIndex: 10,
            "&:hover": {
              bgcolor: alpha(theme.palette.primary.main, 0.3),
            },
            transition: "background-color 0.15s",
          }}
        />

        {/* Header */}
        <Box
          sx={{
            p: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.85rem" }}>
            Scheduled Audits
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{
            minHeight: 36,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            "& .MuiTab-root": {
              minHeight: 36,
              textTransform: "none",
              fontSize: "0.8rem",
              fontWeight: 600,
            },
          }}
        >
          <Tab
            icon={<ScheduleIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={`Upcoming (${schedules.length})`}
          />
          <Tab
            icon={<HistoryIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label={`Past (${results.length})`}
          />
        </Tabs>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: "auto", p: 1.5, ...getScrollbarSx(theme) }}>
          {tab === 0 && (
            <>
              {schedulesLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : sortedSchedules.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <ScheduleIcon sx={{ fontSize: 32, color: "text.disabled", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
                    No scheduled audits yet
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.7rem" }}>
                    Use the calendar icon to create one
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1}>
                  {sortedSchedules.map((s) => (
                    <UpcomingCard
                      key={s.id}
                      schedule={s}
                      theme={theme}
                      onToggle={() => handleToggle(s.id)}
                      onDelete={() => handleDelete(s.id)}
                      toggling={togglingIds.has(s.id)}
                      deleting={deletingIds.has(s.id)}
                      busy={busy}
                    />
                  ))}
                </Stack>
              )}
            </>
          )}

          {tab === 1 && (
            <>
              {historyLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : results.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <HistoryIcon sx={{ fontSize: 32, color: "text.disabled", mb: 1 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
                    No past audits
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.7rem" }}>
                    Audits will appear here after they complete
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1}>
                  {results.map((r) => (
                    <PastCard
                      key={r.id}
                      result={r}
                      theme={theme}
                      onClick={() => setDetailId(r.id)}
                    />
                  ))}
                </Stack>
              )}
            </>
          )}
        </Box>
      </Drawer>

      {/* Past audit detail dialog */}
      <AuditDetailDialog
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        resultId={detailId}
      />
    </>
  );
}
