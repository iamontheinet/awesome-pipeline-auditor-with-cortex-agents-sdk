import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  CalendarMonth,
  Delete,
  Schedule as ScheduleIcon,
  Storage as DatabaseIcon,
} from "@mui/icons-material";
import type { AuditSchedule } from "../hooks/useScheduler";
import { SCHEDULE_PRESETS } from "../hooks/useScheduler";

const SCOPE_LABELS: Record<string, string> = {
  tables_freshness: "Tables & Freshness",
  dynamic_tables: "Dynamic Tables",
  tasks: "Tasks",
  views: "Views",
  streams: "Streams",
  pipes: "Pipes",
  procedures: "Stored Procedures",
};

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  database: string;
  scope: string[];
  schema: string;
  schedules: AuditSchedule[];
  onAdd: (schedule: {
    database: string;
    scope: string[];
    schema: string;
    cronLabel: string;
    intervalMinutes: number;
    enabled: boolean;
    sendEmail: boolean;
  }) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onToggle: (id: string) => void | Promise<void>;
}

/** Format a future date as a simple relative string like "in 5 hours". */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = date.getTime() - now;
  if (diffMs <= 0) return "pending";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "in <1 min";
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? "" : "s"}`;

  const days = Math.round(diffMs / 86_400_000);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Find a preset label by its intervalMinutes value. */
function presetLabel(intervalMinutes: number): string {
  const match = SCHEDULE_PRESETS.find((p) => p.intervalMinutes === intervalMinutes);
  return match?.label ?? "Custom";
}

export function ScheduleDialog({
  open,
  onClose,
  database,
  scope,
  schema,
  schedules,
  onAdd,
  onRemove,
  onToggle,
}: ScheduleDialogProps) {
  const theme = useTheme();
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    SCHEDULE_PRESETS[0]?.intervalMinutes ?? null,
  );
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [scheduleSendEmail, setScheduleSendEmail] = useState(true);

  // True when any async action is in-flight — disables all interactive controls
  const busy = adding || togglingIds.size > 0 || deletingIds.size > 0;

  const handleToggle = async (id: string) => {
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await onToggle(id);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await onRemove(id);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleAdd = async () => {
    if (selectedPreset == null) return;
    setAdding(true);
    try {
      const preset = SCHEDULE_PRESETS.find((p) => p.intervalMinutes === selectedPreset);
      await onAdd({
        database,
        scope,
        schema,
        cronLabel: preset?.label ?? "Custom",
        intervalMinutes: selectedPreset,
        enabled: true,
        sendEmail: scheduleSendEmail,
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: theme.palette.background.paper,
          backgroundImage: "none",
        },
      }}
    >
      {/* ---- Title ---- */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pb: 1,
        }}
      >
        <CalendarMonth fontSize="small" color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Schedule Audit
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* ---- New Schedule section ---- */}
        <Box sx={{ px: 3, py: 2 }}>
          {/* Banner-style DB / Schema / Scopes — matches main audit page */}
           <Box
            sx={{
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
              display: "flex",
              alignItems: "center",
              gap: 1,
              overflow: "hidden",
              mb: 2,
            }}
          >
            <DatabaseIcon sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
              Auditing
            </Typography>
            <Chip
              label={database || "No database"}
              size="small"
              sx={{
                fontSize: "0.65rem",
                height: 20,
                fontWeight: 500,
                bgcolor: alpha(theme.palette.info.main, 0.08),
                color: "text.secondary",
                border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
                flexShrink: 0,
              }}
            />
            {schema && (
              <>
                <Typography sx={{ color: alpha(theme.palette.text.secondary, 0.4), fontSize: "0.9rem", flexShrink: 0 }}>
                  /
                </Typography>
                <Chip
                  label={schema}
                  size="small"
                  sx={{
                    fontSize: "0.65rem",
                    height: 20,
                    fontWeight: 500,
                    bgcolor: alpha(theme.palette.info.main, 0.08),
                    color: "text.secondary",
                    border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
                    flexShrink: 0,
                  }}
                />
              </>
            )}
            {scope.length > 0 && (
              <Typography sx={{ color: alpha(theme.palette.text.secondary, 0.4), fontSize: "0.9rem", flexShrink: 0 }}>
                /
              </Typography>
            )}
            {scope.map((s) => (
              <Chip
                key={s}
                label={SCOPE_LABELS[s] || s.replace(/_/g, " ")}
                size="small"
                sx={{
                  fontSize: "0.65rem",
                  height: 20,
                  fontWeight: 500,
                  bgcolor: alpha(theme.palette.info.main, 0.08),
                  color: "text.secondary",
                  border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
                  flexShrink: 0,
                }}
              />
            ))}
          </Box>

          {/* Interval presets */}
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", mb: 0.75, display: "block" }}
          >
            Interval
          </Typography>
          <ToggleButtonGroup
            value={selectedPreset}
            exclusive
            onChange={(_e, val) => {
              if (val !== null) setSelectedPreset(val);
            }}
            size="small"
            disabled={busy}
            sx={{ mb: 3, flexWrap: "wrap", gap: 0.5 }}
          >
            {SCHEDULE_PRESETS.map((preset) => (
              <ToggleButton
                key={preset.intervalMinutes}
                value={preset.intervalMinutes}
                sx={{
                  textTransform: "none",
                  fontSize: "0.75rem",
                  borderRadius: "8px !important",
                  border: `1px solid ${alpha(theme.palette.divider, 0.3)} !important`,
                  px: 1.5,
                  py: 0.5,
                  "&.Mui-selected": {
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: theme.palette.primary.main,
                    borderColor: `${alpha(theme.palette.primary.main, 0.4)} !important`,
                    fontWeight: 600,
                  },
                }}
              >
                {preset.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Typography
            variant="caption"
            sx={{ display: "block", color: "text.disabled", fontSize: "0.65rem" }}
          >
            * All times are in the account timezone (America/Los_Angeles)
          </Typography>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={scheduleSendEmail}
                onChange={() => setScheduleSendEmail((v) => !v)}
                disabled={busy}
              />
            }
            label={
              <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                Email report on completion
              </Typography>
            }
            sx={{ mt: 1.5 }}
          />
        </Box>

        <Divider />

        {/* ---- Scheduled Audits section ---- */}
        <Box sx={{ px: 3, py: 2 }}>
          <Typography
            variant="overline"
            sx={{
              color: "text.secondary",
              letterSpacing: 1.5,
              fontSize: "0.65rem",
              mb: 1,
              display: "block",
            }}
          >
            Scheduled Audits
          </Typography>

          {schedules.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: "text.disabled", py: 2, textAlign: "center" }}
            >
              No scheduled audits
            </Typography>
          ) : (
            <Stack
              spacing={1}
              sx={{
                maxHeight: 260,
                overflow: "auto",
                "&::-webkit-scrollbar": { width: 6 },
                "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
                "&::-webkit-scrollbar-thumb": {
                  bgcolor: alpha(theme.palette.text.primary, 0.1),
                  borderRadius: 3,
                  "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.2) },
                },
                scrollbarWidth: "thin" as const,
                scrollbarColor: `${alpha(theme.palette.text.primary, 0.1)} transparent`,
              }}
            >
              {schedules.map((s) => (
                <Box
                  key={s.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1.5,
                    bgcolor: alpha(theme.palette.grey[500], 0.04),
                    border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
                    opacity: s.enabled ? 1 : 0.5,
                    transition: "opacity 0.2s",
                  }}
                >
                  {/* Database + schema info */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.database}
                      {s.schema ? ` / ${s.schema}` : ""}
                    </Typography>
                  </Box>

                  {/* Interval label */}
                  <Chip
                    label={presetLabel(s.intervalMinutes)}
                    size="small"
                    sx={{
                      fontSize: "0.65rem",
                      height: 22,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      color: theme.palette.primary.main,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  />

                  {/* Next run */}
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.65rem",
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      minWidth: 70,
                      textAlign: "right",
                    }}
                  >
                    {formatRelativeTime(new Date(s.nextRun))}
                  </Typography>

                  {/* Toggle */}
                  {togglingIds.has(s.id) ? (
                    <CircularProgress size={20} sx={{ flexShrink: 0, mx: 1 }} />
                  ) : (
                    <Switch
                      size="small"
                      checked={s.enabled}
                      onChange={() => handleToggle(s.id)}
                      disabled={busy}
                      sx={{ flexShrink: 0 }}
                    />
                  )}

                  {/* Delete */}
                  {deletingIds.has(s.id) ? (
                    <CircularProgress size={18} sx={{ flexShrink: 0, mx: 0.5 }} />
                  ) : (
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(s.id)}
                      disabled={busy}
                      sx={{
                        color: "text.disabled",
                        flexShrink: 0,
                        "&:hover": { color: theme.palette.error.main },
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </DialogContent>

      {/* ---- Footer ---- */}
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button
          variant={theme.palette.mode === "light" ? "outlined" : "contained"}
          startIcon={adding ? <CircularProgress size={18} color="inherit" /> : <ScheduleIcon />}
          disabled={!database || scope.length === 0 || selectedPreset == null || busy}
          onClick={handleAdd}
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            fontWeight: 600,
            px: 3,
            ...(theme.palette.mode === "light" && {
              borderColor: theme.palette.primary.main,
              borderWidth: 1.5,
              "&:hover": {
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                borderColor: theme.palette.primary.dark,
              },
            }),
          }}
        >
          {adding ? "Scheduling..." : "Schedule"}
        </Button>
        <Button
          onClick={onClose}
          sx={{ borderRadius: 1.5, textTransform: "none" }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
