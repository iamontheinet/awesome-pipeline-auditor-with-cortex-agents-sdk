import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
} from "@mui/icons-material";
import type { AuditSchedule } from "../hooks/useScheduler";
import { SCHEDULE_PRESETS } from "../hooks/useScheduler";

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  database: string;
  connection: string;
  scope: string[];
  schema: string;
  schedules: AuditSchedule[];
  onAdd: (schedule: Omit<AuditSchedule, "id" | "nextRun" | "createdAt">) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}

/** Format a future date as a simple relative string like "in 5 hours". */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = date.getTime() - now;
  if (diffMs <= 0) return "now";

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "in <1 min";
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? "" : "s"}`;

  const days = Math.round(diffMs / 86_400_000);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Find a preset label by its intervalMs value. */
function presetLabel(intervalMs: number): string {
  const match = SCHEDULE_PRESETS.find((p) => p.intervalMs === intervalMs);
  return match?.label ?? "Custom";
}

export function ScheduleDialog({
  open,
  onClose,
  database,
  connection,
  scope,
  schema,
  schedules,
  onAdd,
  onRemove,
  onToggle,
}: ScheduleDialogProps) {
  const theme = useTheme();
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    SCHEDULE_PRESETS[0]?.intervalMs ?? null,
  );

  const handleAdd = () => {
    if (selectedPreset == null) return;
    const preset = SCHEDULE_PRESETS.find((p) => p.intervalMs === selectedPreset);
    onAdd({
      database,
      connection,
      scope,
      schema,
      cronLabel: preset?.label ?? "Custom",
      intervalMs: selectedPreset,
      enabled: true,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
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
            New Schedule
          </Typography>

          {/* Current config chips — row 1: database, connection, schema */}
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Chip
              label={database || "No database"}
              size="small"
              sx={{
                fontSize: "0.7rem",
                height: 24,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                fontWeight: 600,
              }}
            />
            <Chip
              label={connection || "No connection"}
              size="small"
              sx={{
                fontSize: "0.7rem",
                height: 24,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.secondary.main, 0.1),
                color: theme.palette.secondary.main,
                fontWeight: 500,
              }}
            />
            {schema && (
              <Chip
                label={schema}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: "0.7rem",
                  height: 24,
                  borderRadius: 1,
                  borderColor: alpha(theme.palette.divider, 0.5),
                  color: "text.secondary",
                }}
              />
            )}
          </Stack>

          {/* Row 2: scope chips */}
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontSize: "0.7rem", whiteSpace: "nowrap", lineHeight: "24px" }}>
              Scope:
            </Typography>
            {scope.length === 0 ? (
              <Chip
                label="No scopes"
                size="small"
                variant="outlined"
                sx={{
                  fontSize: "0.7rem",
                  height: 24,
                  borderRadius: 1,
                  borderColor: alpha(theme.palette.error.main, 0.4),
                  color: "text.disabled",
                }}
              />
            ) : (
              scope.map((s) => (
                <Chip
                  key={s}
                  label={s.replace(/_/g, " ")}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: "0.65rem",
                    height: 24,
                    borderRadius: 1,
                    borderColor: alpha(theme.palette.divider, 0.5),
                    color: "text.secondary",
                    textTransform: "capitalize",
                  }}
                />
              ))
            )}
          </Stack>

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
            sx={{ mb: 2, flexWrap: "wrap", gap: 0.5 }}
          >
            {SCHEDULE_PRESETS.map((preset) => (
              <ToggleButton
                key={preset.intervalMs}
                value={preset.intervalMs}
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

          <Button
            variant="contained"
            startIcon={<ScheduleIcon />}
            disabled={!database || !connection || scope.length === 0 || selectedPreset == null}
            onClick={handleAdd}
            sx={{
              borderRadius: 1.5,
              textTransform: "none",
              fontWeight: 600,
              px: 3,
            }}
          >
            Schedule
          </Button>
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
                  bgcolor: "rgba(255,255,255,0.1)",
                  borderRadius: 3,
                  "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
                },
                scrollbarWidth: "thin" as const,
                scrollbarColor: "rgba(255,255,255,0.1) transparent",
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
                    <Typography
                      variant="caption"
                      sx={{ color: "text.disabled", fontSize: "0.65rem" }}
                    >
                      {s.connection}
                    </Typography>
                  </Box>

                  {/* Interval label */}
                  <Chip
                    label={presetLabel(s.intervalMs)}
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
                  <Switch
                    size="small"
                    checked={s.enabled}
                    onChange={() => onToggle(s.id)}
                    sx={{ flexShrink: 0 }}
                  />

                  {/* Delete */}
                  <IconButton
                    size="small"
                    onClick={() => onRemove(s.id)}
                    sx={{
                      color: "text.disabled",
                      flexShrink: 0,
                      "&:hover": { color: theme.palette.error.main },
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </DialogContent>

      {/* ---- Footer ---- */}
      <DialogActions sx={{ px: 3, py: 1.5 }}>
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
