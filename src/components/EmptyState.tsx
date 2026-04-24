import {
  Box,
  Typography,
  Stack,
  Paper,
  Chip,
  alpha,
  useTheme,
} from "@mui/material";
import {
  AccountTree as PipelineIcon,
  Search as SearchIcon,
  HealthAndSafety as HealthIcon,
  Speed as FreshnessIcon,
  AutoFixHigh as FixIcon,
  Schedule as ScheduleIcon,
  History as HistoryIcon,
} from "@mui/icons-material";

const FEATURES = [
  {
    icon: <SearchIcon sx={{ fontSize: 20 }} />,
    label: "Pipeline Discovery",
    description: "Tables, dynamic tables, tasks, streams, pipes, and procedures",
  },
  {
    icon: <FreshnessIcon sx={{ fontSize: 20 }} />,
    label: "Freshness Analysis",
    description: "Detect stale data and monitor table update frequency",
  },
  {
    icon: <HealthIcon sx={{ fontSize: 20 }} />,
    label: "Health Monitoring",
    description: "Dynamic table refresh failures, task errors, and scheduling issues",
  },
  {
    icon: <FixIcon sx={{ fontSize: 20 }} />,
    label: "AI-Powered Fixes",
    description: "Get remediation suggestions for identified issues",
  },
];

export function EmptyState() {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        p: 4,
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          border: `3px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 3,
        }}
      >
        <PipelineIcon sx={{ fontSize: 32, color: "primary.main" }} />
      </Box>

      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          mb: 1,
          background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Pipeline Auditor
      </Typography>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 3, maxWidth: 420, textAlign: "center" }}
      >
        Comprehensive audit of your Snowflake data pipelines powered by the
        Cortex Code Agent SDK.
      </Typography>

      {/* How to start — horizontal steps with pipe delimiter */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ mb: 3 }}
      >
        {["Select a database and schema", "Choose audit scopes", "Click Run Audit"].map((step, i) => (
          <Stack key={i} direction="row" alignItems="center" spacing={1.5}>
            {i > 0 && (
              <Typography sx={{ color: alpha(theme.palette.text.secondary, 0.4), fontWeight: 300, fontSize: "1.2rem" }}>
                |
              </Typography>
            )}
            <Chip
              label={`${i + 1}`}
              size="small"
              sx={{
                width: 22,
                height: 22,
                fontSize: "0.7rem",
                fontWeight: 700,
                bgcolor: alpha(theme.palette.primary.main, 0.15),
                color: "primary.main",
                "& .MuiChip-label": { px: 0 },
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.85rem" }}>
              {step}
            </Typography>
          </Stack>
        ))}
      </Stack>

      {/* Feature highlights — non-clickable */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 1.5,
          width: "100%",
          maxWidth: 520,
          mb: 3,
        }}
      >
        {FEATURES.map((feature) => (
          <Paper
            key={feature.label}
            elevation={0}
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <Box sx={{ color: "primary.main", mt: 0.25, flexShrink: 0 }}>{feature.icon}</Box>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", display: "block" }}>
                {feature.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.4 }}>
                {feature.description}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>

      {/* Scheduling + audit history blurbs */}
      <Stack direction="row" spacing={2} sx={{ mb: 3, maxWidth: 520, width: "100%" }}>
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            p: 1.5,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.secondary.main, 0.04),
            border: `1px solid ${alpha(theme.palette.secondary.main, 0.15)}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
          }}
        >
          <ScheduleIcon sx={{ fontSize: 18, color: "secondary.main", mt: 0.25 }} />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", display: "block" }}>
              Schedule Audits
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.4 }}>
              Set up recurring audits with email reports using the calendar icon in the header.
            </Typography>
          </Box>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            p: 1.5,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.info.main, 0.04),
            border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
          }}
        >
          <HistoryIcon sx={{ fontSize: 18, color: "info.main", mt: 0.25 }} />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", display: "block" }}>
              Audit History
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem", lineHeight: 1.4 }}>
              View past audit results and trends in the schedule panel.
            </Typography>
          </Box>
        </Paper>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Chip
          label="Read-only audit"
          size="small"
          variant="outlined"
          sx={{ fontSize: "0.65rem" }}
        />
        <Chip
          label="Cortex Code Agent SDK"
          size="small"
          variant="outlined"
          sx={{ fontSize: "0.65rem" }}
        />
        <Chip
          label="Structured output"
          size="small"
          variant="outlined"
          sx={{ fontSize: "0.65rem" }}
        />
      </Stack>
    </Box>
  );
}
