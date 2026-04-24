import { useState, useEffect, useCallback } from "react";
import type { Theme } from "@mui/material";
import {
  Box,
  Button,
  Typography,
  Paper,
  Stack,
  Chip,
  alpha,
  useTheme,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Badge,
  Tooltip,
} from "@mui/material";
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  CalendarMonth as ScheduleIcon,
  ViewTimeline as PanelIcon,
  Refresh as RefreshIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  KeyboardArrowDown as ArrowIcon,
} from "@mui/icons-material";
import { useThemeMode } from "../ThemeContext";
import { ScheduleDialog } from "./ScheduleDialog";
import { useScheduler } from "../hooks/useScheduler";

export type AuditScope =
  | "tables_freshness"
  | "dynamic_tables"
  | "tasks"
  | "views"
  | "streams"
  | "pipes"
  | "procedures";

interface ScopeOption {
  key: AuditScope;
  label: string;
  defaultOn: boolean;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { key: "tables_freshness", label: "Tables & Freshness", defaultOn: true },
  { key: "dynamic_tables", label: "Dynamic Tables", defaultOn: true },
  { key: "tasks", label: "Tasks", defaultOn: true },
  { key: "views", label: "Views", defaultOn: true },
  { key: "streams", label: "Streams", defaultOn: false },
  { key: "pipes", label: "Pipes", defaultOn: false },
  { key: "procedures", label: "Stored Procedures", defaultOn: false },
];

const DEFAULT_SCOPE = SCOPE_OPTIONS.filter((o) => o.defaultOn).map((o) => o.key);

interface AuditHeaderProps {
  onStartAudit: (database: string, scope: AuditScope[], schema: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  isAuditing: boolean;
  schedulePanelOpen: boolean;
  onToggleSchedulePanel: () => void;
}

// Minimal select styling — borderless, compact, modern
const minimalSelectSx = (theme: Theme) => ({
  fontSize: "0.8rem",
  fontWeight: 600,
  color: theme.palette.text.primary,
  "& .MuiSelect-select": {
    py: 0.5,
    px: 1,
    pr: "24px !important",
    borderRadius: 1,
    bgcolor: alpha(theme.palette.text.primary, 0.04),
    "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.08) },
  },
  "& .MuiOutlinedInput-notchedOutline": { border: "none" },
  "& .MuiSelect-icon": { color: alpha(theme.palette.text.primary, 0.4), fontSize: 18 },
});

export function AuditHeader({
  onStartAudit,
  onCancel,
  isLoading,
  isAuditing,
  schedulePanelOpen,
  onToggleSchedulePanel,
}: AuditHeaderProps) {
  const theme = useTheme();
  const { mode, toggleTheme } = useThemeMode();

  // Database state
  const [databases, setDatabases] = useState<string[]>([]);
  const [database, setDatabase] = useState("");
  const [databasesLoading, setDatabasesLoading] = useState(true);

  // Schema state
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState("");
  const [schemasLoading, setSchemasLoading] = useState(false);

  // Audit scope state
  const [scope, setScope] = useState<AuditScope[]>(DEFAULT_SCOPE);

  // Schedule dialog state
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Scheduler hook
  const { schedules, addSchedule, removeSchedule, toggleSchedule } = useScheduler();

  const toggleScope = (key: AuditScope) => {
    setScope((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Fetch schemas when database changes
  const fetchSchemas = useCallback((db: string) => {
    if (!db) return;
    setSchemasLoading(true);
    setSchemas([]);
    setSchema("");
    fetch(`/api/schemas?database=${encodeURIComponent(db)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const s = (data.schemas || []) as string[];
        setSchemas(s);
      })
      .catch(() => setSchemas([]))
      .finally(() => setSchemasLoading(false));
  }, []);

  // Fetch databases
  const fetchDatabases = useCallback(() => {
    setDatabasesLoading(true);
    fetch("/api/databases", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const dbs = data.databases || [];
        setDatabases(dbs);
        let selectedDb = "";
        if (dbs.length > 0) {
          selectedDb = dbs[0];
        }
        if (selectedDb) {
          setDatabase(selectedDb);
          fetchSchemas(selectedDb);
        }
      })
      .catch(() => setDatabases([]))
      .finally(() => setDatabasesLoading(false));
  }, [fetchSchemas]);

  // Fetch databases on mount
  useEffect(() => {
    fetchDatabases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDatabaseChange = useCallback((db: string) => {
    setDatabase(db);
    fetchSchemas(db);
  }, [fetchSchemas]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (database && schema && scope.length > 0) {
      onStartAudit(database, scope, schema);
    }
  };

  const selectorsDisabled = isLoading;

  return (
    <>
    <Paper
      elevation={0}
      component="form"
      onSubmit={handleSubmit}
      sx={{
        py: 1,
        px: 2,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
        bgcolor:
          theme.palette.mode === "dark"
            ? alpha(theme.palette.background.paper, 0.85)
            : theme.palette.background.paper,
        backdropFilter: "blur(12px)",
        zIndex: 1300,
        position: "relative",
      }}
    >
      {/* db/schema breadcrumb | scope pills | Run | actions */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "nowrap" }}>
        {/* Database / Schema breadcrumb */}
        <Stack direction="row" alignItems="center" spacing={0.25} sx={{ flexShrink: 0 }}>
          <Select
            value={database}
            onChange={(e) => handleDatabaseChange(e.target.value)}
            disabled={selectorsDisabled || databasesLoading || databases.length === 0}
            displayEmpty
            renderValue={(v) => v || (databasesLoading ? "Loading..." : "Database")}
            IconComponent={ArrowIcon}
            size="small"
            sx={minimalSelectSx(theme)}
          >
            {databases.map((db) => (
              <MenuItem key={db} value={db} sx={{ fontSize: "0.8rem" }}>
                {db}
              </MenuItem>
            ))}
          </Select>

          <Typography sx={{ color: alpha(theme.palette.text.secondary, 0.3), fontSize: "1rem", mx: 0.25, userSelect: "none" }}>
            /
          </Typography>

          <Select
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            disabled={selectorsDisabled || schemasLoading || !database}
            displayEmpty
            renderValue={(v) => v || (schemasLoading ? "Loading..." : "Schema")}
            IconComponent={ArrowIcon}
            size="small"
            sx={minimalSelectSx(theme)}
          >
            {schemas.map((s) => (
              <MenuItem key={s} value={s} sx={{ fontSize: "0.8rem" }}>
                {s}
              </MenuItem>
            ))}
          </Select>

          <Tooltip title="Refresh">
            <span>
            <IconButton
              size="small"
              onClick={() => { fetchDatabases(); if (database) fetchSchemas(database); }}
              disabled={selectorsDisabled || databasesLoading}
              sx={{ color: alpha(theme.palette.text.secondary, 0.3), ml: 0.25, "&:hover": { color: "primary.main" } }}
            >
              {databasesLoading || schemasLoading ? <CircularProgress size={14} /> : <RefreshIcon sx={{ fontSize: 16 }} />}
            </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {/* Scope pills — inline on row 1 */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: 1, overflow: "auto", mx: 1 }}>
          {SCOPE_OPTIONS.map((opt) => {
            const selected = scope.includes(opt.key);
            return (
              <Chip
                key={opt.key}
                label={opt.label}
                size="small"
                clickable
                disabled={selectorsDisabled}
                onClick={() => toggleScope(opt.key)}
                variant={selected ? "filled" : "outlined"}
                sx={{
                  fontSize: "0.68rem",
                  height: 22,
                  borderRadius: 99,
                  fontWeight: selected ? 600 : 400,
                  flexShrink: 0,
                  bgcolor: selected
                    ? alpha(theme.palette.primary.main, 0.12)
                    : "transparent",
                  borderColor: selected
                    ? alpha(theme.palette.primary.main, 0.4)
                    : alpha(theme.palette.divider, 0.4),
                  color: selected
                    ? theme.palette.primary.main
                    : theme.palette.text.secondary,
                  "&:hover": {
                    bgcolor: selected
                      ? alpha(theme.palette.primary.main, 0.2)
                      : alpha(theme.palette.action.hover, 0.06),
                  },
                }}
              />
            );
          })}
        </Stack>

        {/* Primary CTA */}
        {isLoading ? (
          <Button
            type="button"
            variant={theme.palette.mode === "light" ? "outlined" : "contained"}
            color="error"
            size="small"
            startIcon={<StopIcon sx={{ fontSize: 16 }} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
            sx={{ borderRadius: 99, textTransform: "none", fontWeight: 600, px: 2.5, height: 32, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            Cancel
          </Button>
        ) : (
          <Button
            type="submit"
            variant={theme.palette.mode === "light" ? "outlined" : "contained"}
            size="small"
            startIcon={<PlayIcon sx={{ fontSize: 16 }} />}
            disabled={!database || !schema || scope.length === 0}
            sx={{
              borderRadius: 99,
              textTransform: "none",
              fontWeight: 600,
              px: 2.5,
              height: 32,
              whiteSpace: "nowrap",
              flexShrink: 0,
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
            Run Audit
          </Button>
        )}

        {/* Divider line */}
        <Box sx={{ width: 1, height: 20, bgcolor: alpha(theme.palette.divider, 0.5), mx: 0.5 }} />

        {/* Icon cluster */}
        <Stack direction="row" spacing={0.25}>
          <Tooltip title={!schema ? "Select a schema first" : "Schedule recurring audit"}>
            <span>
            <IconButton
              size="small"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScheduleOpen(true); }}
              disabled={selectorsDisabled || !database || !schema}
              sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
            >
              <Badge
                badgeContent={schedules.length}
                color="primary"
                sx={{ "& .MuiBadge-badge": { fontSize: "0.55rem", height: 14, minWidth: 14 } }}
              >
                <ScheduleIcon sx={{ fontSize: 20 }} />
              </Badge>
            </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={schedulePanelOpen ? "Hide schedule panel" : "Show schedule panel"}>
            <IconButton
              size="small"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSchedulePanel(); }}
              sx={{
                color: schedulePanelOpen ? "primary.main" : "text.secondary",
                bgcolor: schedulePanelOpen ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                "&:hover": { color: "primary.main" },
              }}
            >
              <PanelIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
            <IconButton
              size="small"
              onClick={toggleTheme}
              sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
            >
              {mode === "dark" ? <LightModeIcon sx={{ fontSize: 20 }} /> : <DarkModeIcon sx={{ fontSize: 20 }} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Paper>

    {/* Schedule dialog */}
    <ScheduleDialog
      open={scheduleOpen}
      onClose={() => setScheduleOpen(false)}
      database={database}
      scope={scope}
      schema={schema}
      schedules={schedules}
      onAdd={addSchedule}
      onRemove={removeSchedule}
      onToggle={toggleSchedule}
    />
    </>
  );
}
