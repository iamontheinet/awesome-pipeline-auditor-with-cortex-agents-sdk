import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  alpha,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Inventory as InventoryIcon,
  BugReport as FindingsIcon,
} from "@mui/icons-material";
import type { AuditReport, Finding, Severity, OverallHealth } from "../types";

interface ReportPanelProps {
  report: AuditReport;
}

const severityColor: Record<Severity, string> = {
  critical: "#f44336",
  warning: "#ff9800",
  info: "#2196f3",
};

const severityIcon: Record<Severity, React.ReactNode> = {
  critical: <ErrorIcon sx={{ fontSize: 16 }} />,
  warning: <WarningIcon sx={{ fontSize: 16 }} />,
  info: <InfoIcon sx={{ fontSize: 16 }} />,
};

const healthConfig: Record<
  OverallHealth,
  { color: string; label: string; icon: React.ReactNode }
> = {
  healthy: {
    color: "#4caf50",
    label: "HEALTHY",
    icon: <CheckIcon sx={{ fontSize: 20 }} />,
  },
  needs_attention: {
    color: "#ff9800",
    label: "NEEDS ATTENTION",
    icon: <WarningIcon sx={{ fontSize: 20 }} />,
  },
  unhealthy: {
    color: "#f44336",
    label: "UNHEALTHY",
    icon: <ErrorIcon sx={{ fontSize: 20 }} />,
  },
};

export function ReportPanel({ report }: ReportPanelProps) {
  const theme = useTheme();
  const { summary, pipeline_inventory: inv, findings } = report;
  const health = healthConfig[summary.overall_health] || healthConfig.healthy;

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%" }}>
      {/* Health Badge */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          bgcolor: alpha(health.color, 0.08),
          border: `2px solid ${alpha(health.color, 0.3)}`,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Box sx={{ color: health.color }}>{health.icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, color: health.color }}
          >
            {health.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {report.database} &middot; {report.audit_timestamp}
          </Typography>
        </Box>
      </Paper>

      {/* Summary Cards */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        {[
          {
            label: "Objects",
            value: summary.total_objects,
            color: theme.palette.primary.main,
          },
          { label: "Critical", value: summary.critical, color: "#f44336" },
          { label: "Warning", value: summary.warning, color: "#ff9800" },
          { label: "Info", value: summary.info, color: "#2196f3" },
        ].map((card) => (
          <Paper
            key={card.label}
            elevation={0}
            sx={{
              flex: 1,
              p: 1.5,
              textAlign: "center",
              borderRadius: 1.5,
              bgcolor: alpha(card.color, 0.06),
              border: `1px solid ${alpha(card.color, 0.15)}`,
            }}
          >
            <Typography
              variant="h5"
              sx={{ fontWeight: 700, color: card.color }}
            >
              {card.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {card.label}
            </Typography>
          </Paper>
        ))}
      </Stack>

      {/* Pipeline Inventory */}
      <Accordion
        defaultExpanded
        sx={{
          mb: 2,
          boxShadow: "none",
          border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          borderRadius: "8px !important",
          "&:before": { display: "none" },
          overflow: "hidden",
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <InventoryIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Pipeline Inventory
            </Typography>
            <Chip
              label={`${inv.schemas.length} schemas`}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.65rem", height: 20 }}
            />
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              <strong>Schemas:</strong> {inv.schemas.join(", ")}
            </Typography>
            <Divider />
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Chip
                label={`${inv.tables.length} tables`}
                size="small"
                sx={{ fontSize: "0.7rem" }}
              />
              <Chip
                label={`${inv.dynamic_tables.length} dynamic tables`}
                size="small"
                sx={{ fontSize: "0.7rem" }}
              />
              <Chip
                label={`${inv.tasks.length} tasks`}
                size="small"
                sx={{ fontSize: "0.7rem" }}
              />
              <Chip
                label={`${inv.views.length} views`}
                size="small"
                sx={{ fontSize: "0.7rem" }}
              />
            </Stack>

            {inv.dynamic_tables.length > 0 && (
              <>
                <Divider />
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, mt: 1 }}
                >
                  Dynamic Tables
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Schema</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Target Lag</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>State</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {inv.dynamic_tables.map((dt, i) => (
                        <TableRow key={i}>
                          <TableCell sx={{ fontSize: "0.75rem" }}>{dt.name}</TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>{dt.schema}</TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>{dt.target_lag || "-"}</TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>
                            <Chip
                              label={dt.scheduling_state || "unknown"}
                              size="small"
                              color={dt.scheduling_state === "ACTIVE" ? "success" : "default"}
                              sx={{ fontSize: "0.65rem", height: 18 }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Findings Table */}
      <Accordion
        defaultExpanded
        sx={{
          boxShadow: "none",
          border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          borderRadius: "8px !important",
          "&:before": { display: "none" },
          overflow: "hidden",
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <FindingsIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Findings
            </Typography>
            <Chip
              label={`${findings.length} total`}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.65rem", height: 20 }}
            />
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", width: 30 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", width: 80 }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem", width: 110 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Object</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>Message</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {findings.map((f: Finding, i: number) => (
                  <TableRow
                    key={i}
                    sx={{
                      "&:hover": {
                        bgcolor: alpha(severityColor[f.severity], 0.04),
                      },
                    }}
                  >
                    <TableCell sx={{ fontSize: "0.75rem" }}>{i + 1}</TableCell>
                    <TableCell>
                      <Chip
                        icon={severityIcon[f.severity] as React.ReactElement}
                        label={f.severity.toUpperCase()}
                        size="small"
                        sx={{
                          fontSize: "0.6rem",
                          height: 20,
                          fontWeight: 600,
                          bgcolor: alpha(severityColor[f.severity], 0.1),
                          color: severityColor[f.severity],
                          border: `1px solid ${alpha(severityColor[f.severity], 0.3)}`,
                          "& .MuiChip-icon": {
                            color: severityColor[f.severity],
                          },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={f.category.replace("_", " ")}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.65rem", height: 18 }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: "0.75rem",
                        fontFamily: '"Fira Code", monospace',
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.object}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.75rem" }}>
                      {f.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
