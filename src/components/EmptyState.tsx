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
  Storage as StorageIcon,
  Search as SearchIcon,
  HealthAndSafety as HealthIcon,
  Speed as FreshnessIcon,
} from "@mui/icons-material";

interface EmptyStateProps {
  onStartAudit: (database: string) => void;
}

const STARTER_PROMPTS = [
  {
    icon: <SearchIcon sx={{ fontSize: 18 }} />,
    label: "Discover pipeline",
    description: "Audit AUTOMATED_INTELLIGENCE database",
    database: "AUTOMATED_INTELLIGENCE",
  },
  {
    icon: <FreshnessIcon sx={{ fontSize: 18 }} />,
    label: "Check freshness",
    description: "Find stale tables across schemas",
    database: "AUTOMATED_INTELLIGENCE",
  },
  {
    icon: <HealthIcon sx={{ fontSize: 18 }} />,
    label: "DT health check",
    description: "Dynamic table refresh status",
    database: "AUTOMATED_INTELLIGENCE",
  },
];

export function EmptyState({ onStartAudit }: EmptyStateProps) {
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
        <StorageIcon sx={{ fontSize: 32, color: "primary.main" }} />
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
        sx={{ mb: 4, maxWidth: 400, textAlign: "center" }}
      >
              Comprehensive audit of your Snowflake data pipelines. Discovers tables,
              dynamic tables, tasks, streams, pipes, and procedures. Checks freshness,
              validates health, and identifies issues. Customize scope above.
      </Typography>

      <Stack spacing={1.5} sx={{ width: "100%", maxWidth: 380 }}>
        {STARTER_PROMPTS.map((prompt) => (
          <Paper
            key={prompt.label}
            elevation={0}
            onClick={() => onStartAudit(prompt.database)}
            sx={{
              p: 2,
              borderRadius: 2,
              cursor: "pointer",
              border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              transition: "all 0.2s",
              "&:hover": {
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                borderColor: alpha(theme.palette.primary.main, 0.3),
                transform: "translateY(-1px)",
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.1)}`,
              },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ color: "primary.main" }}>{prompt.icon}</Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {prompt.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {prompt.description}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 4 }}>
        <Chip
          label="Read-only mode"
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
