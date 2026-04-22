import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  Stack,
  Chip,
  alpha,
  useTheme,
  FormControl,
  InputLabel,
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
  Storage as StorageIcon,
  CalendarMonth as ScheduleIcon,
} from "@mui/icons-material";
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
  onStartAudit: (database: string, connection: string, scope: AuditScope[], schema: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  isAuditing: boolean;
}

export function AuditHeader({
  onStartAudit,
  onCancel,
  isLoading,
  isAuditing,
}: AuditHeaderProps) {
  const theme = useTheme();

  // Connection state
  const [connections, setConnections] = useState<string[]>([]);
  const [connection, setConnection] = useState("");
  const [connectionsLoading, setConnectionsLoading] = useState(true);

  // Database state
  const [databases, setDatabases] = useState<string[]>([]);
  const [database, setDatabase] = useState("");
  const [databasesLoading, setDatabasesLoading] = useState(false);

  // Schema state
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState("__ALL__");
  const [schemasLoading, setSchemasLoading] = useState(false);

  // Audit scope state
  const [scope, setScope] = useState<AuditScope[]>(DEFAULT_SCOPE);

  // Schedule dialog state
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Scheduler hook — auto-triggers onStartAudit when a schedule fires
  const { schedules, addSchedule, removeSchedule, toggleSchedule } = useScheduler(
    useCallback(
      (schedule) => {
        onStartAudit(schedule.database, schedule.connection, schedule.scope as AuditScope[], schedule.schema);
      },
      [onStartAudit]
    )
  );

  const toggleScope = (key: AuditScope) => {
    setScope((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Fetch connections on mount
  useEffect(() => {
    fetch("/api/connections")
      .then((r) => r.json())
      .then((data) => {
        setConnections(data.connections || []);
        if (data.active && data.connections?.includes(data.active)) {
          setConnection(data.active);
        } else if (data.connections?.length > 0) {
          setConnection(data.connections[0]);
        }
      })
      .catch(() => setConnections([]))
      .finally(() => setConnectionsLoading(false));
  }, []);

  // Fetch databases when connection changes
  const fetchDatabases = useCallback((conn: string) => {
    if (!conn) return;
    setDatabasesLoading(true);
    setDatabases([]);
    setDatabase("");
    setSchemas([]);
    setSchema("__ALL__");
    fetch(`/api/databases?connection=${encodeURIComponent(conn)}`)
      .then((r) => r.json())
      .then((data) => {
        const dbs = data.databases || [];
        setDatabases(dbs);
        if (dbs.includes("AUTOMATED_INTELLIGENCE")) {
          setDatabase("AUTOMATED_INTELLIGENCE");
        } else if (dbs.length > 0) {
          setDatabase(dbs[0]);
        }
      })
      .catch(() => setDatabases([]))
      .finally(() => setDatabasesLoading(false));
  }, []);

  // Fetch schemas when database changes
  const fetchSchemas = useCallback((conn: string, db: string) => {
    if (!conn || !db) return;
    setSchemasLoading(true);
    setSchemas([]);
    setSchema("__ALL__");
    fetch(`/api/schemas?connection=${encodeURIComponent(conn)}&database=${encodeURIComponent(db)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = (data.schemas || []) as string[];
        setSchemas(s);
      })
      .catch(() => setSchemas([]))
      .finally(() => setSchemasLoading(false));
  }, []);

  useEffect(() => {
    if (connection) {
      fetchDatabases(connection);
    }
  }, [connection, fetchDatabases]);

  useEffect(() => {
    if (connection && database) {
      fetchSchemas(connection, database);
    }
  }, [connection, database, fetchSchemas]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (database && connection && scope.length > 0) {
      onStartAudit(database, connection, scope, schema === "__ALL__" ? "" : schema);
    }
  };

  const selectorsDisabled = isLoading;

  return (
    <>
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
        bgcolor:
          theme.palette.mode === "dark"
            ? alpha(theme.palette.background.paper, 0.8)
            : theme.palette.background.paper,
        zIndex: 1300,
        position: "relative",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ md: "flex-start" }}
        spacing={2}
      >
        {/* Logo */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, pt: 0.75 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              border: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <StorageIcon color="primary" fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              Pipeline Auditor
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: "0.7rem" }}
            >
              Powered by Cortex Code Agent SDK
            </Typography>
          </Box>
        </Stack>

        {/* Selectors + scope — two rows */}
        <Box component="form" onSubmit={handleSubmit} sx={{ flex: 1 }}>
          <Stack spacing={1}>
            {/* Row 1: selectors + button */}
            <Stack direction="row" spacing={1.5} alignItems="center">
              <FormControl size="small" sx={{ width: 240, flexShrink: 0 }}>
                <InputLabel>Connection</InputLabel>
                <Select
                  value={connection}
                  label="Connection"
                  onChange={(e) => setConnection(e.target.value)}
                  disabled={selectorsDisabled || connectionsLoading}
                  sx={{ borderRadius: 1.5 }}
                  endAdornment={
                    connectionsLoading ? (
                      <CircularProgress size={16} sx={{ mr: 2 }} />
                    ) : undefined
                  }
                >
                  {connections.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ width: 280, flexShrink: 0 }}>
                <InputLabel>Database</InputLabel>
                <Select
                  value={database}
                  label="Database"
                  onChange={(e) => setDatabase(e.target.value)}
                  disabled={selectorsDisabled || databasesLoading || databases.length === 0}
                  sx={{ borderRadius: 1.5 }}
                  endAdornment={
                    databasesLoading ? (
                      <CircularProgress size={16} sx={{ mr: 2 }} />
                    ) : undefined
                  }
                >
                  {databases.map((db) => (
                    <MenuItem key={db} value={db}>
                      {db}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ width: 200, flexShrink: 0 }}>
                <InputLabel>Schema</InputLabel>
                <Select
                  value={schema}
                  label="Schema"
                  onChange={(e) => setSchema(e.target.value)}
                  disabled={selectorsDisabled || schemasLoading || !database}
                  sx={{ borderRadius: 1.5 }}
                  endAdornment={
                    schemasLoading ? (
                      <CircularProgress size={16} sx={{ mr: 2 }} />
                    ) : undefined
                  }
                >
                  <MenuItem value="__ALL__">All Schemas</MenuItem>
                  {schemas.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ flexShrink: 0 }}>
                {isLoading ? (
                  <Button
                    type="button"
                    variant="contained"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onCancel();
                    }}
                    sx={{ borderRadius: 1.5, textTransform: "none", minWidth: 160, whiteSpace: "nowrap" }}
                  >
                    Cancel Audit
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<PlayIcon />}
                    disabled={!database || !connection || scope.length === 0}
                    sx={{
                      borderRadius: 1.5,
                      textTransform: "none",
                      fontWeight: 600,
                      px: 3,
                      minWidth: 160,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Run Audit
                  </Button>
                )}
              </Box>
              <Tooltip title="Schedule recurring audit">
                <IconButton
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setScheduleOpen(true);
                  }}
                  disabled={selectorsDisabled}
                  sx={{
                    flexShrink: 0,
                    color: "text.secondary",
                    "&:hover": { color: "primary.main" },
                  }}
                >
                  <Badge
                    badgeContent={schedules.length}
                    color="primary"
                    sx={{
                      "& .MuiBadge-badge": {
                        fontSize: "0.6rem",
                        height: 16,
                        minWidth: 16,
                      },
                    }}
                  >
                    <ScheduleIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Row 2: scope chips — aligned under Connection selector */}
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                Scope:
              </Typography>
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
                      fontSize: "0.7rem",
                      height: 24,
                      borderRadius: 1,
                      fontWeight: selected ? 600 : 400,
                      bgcolor: selected
                        ? alpha(theme.palette.primary.main, 0.15)
                        : "transparent",
                      borderColor: selected
                        ? theme.palette.primary.main
                        : alpha(theme.palette.divider, 0.5),
                      color: selected
                        ? theme.palette.primary.main
                        : theme.palette.text.secondary,
                      "&:hover": {
                        bgcolor: selected
                          ? alpha(theme.palette.primary.main, 0.25)
                          : alpha(theme.palette.action.hover, 0.08),
                      },
                    }}
                  />
                );
              })}
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </Paper>

    {/* Schedule dialog — rendered with current selector state */}
    <ScheduleDialog
      open={scheduleOpen}
      onClose={() => setScheduleOpen(false)}
      database={database}
      connection={connection}
      scope={scope}
      schema={schema === "__ALL__" ? "" : schema}
      schedules={schedules}
      onAdd={addSchedule}
      onRemove={removeSchedule}
      onToggle={toggleSchedule}
    />
    </>
  );
}
