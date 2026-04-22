import { useRef, useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  alpha,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  LinearProgress,
  Chip,
  Button,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  AutoAwesome as ThinkingIcon,
  Person as UserIcon,
  SmartToy as BotIcon,
  Assessment as ReportIcon,
  Timeline as TimelineIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, AuditReport, ToolProgressEvent } from "../types";
import { ReportPanel } from "./ReportPanel";
import { AuditPhase, ActivityFeed } from "./AuditSidebar";

// Dark-themed scrollbar styles
const scrollbarSx = {
  "&::-webkit-scrollbar": { width: 6 },
  "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    bgcolor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
  },
  scrollbarWidth: "thin" as const,
  scrollbarColor: "rgba(255,255,255,0.1) transparent",
};

interface ChatThreadProps {
  messages: ChatMessage[];
  report?: AuditReport | null;
  toolProgress?: ToolProgressEvent[];
  isLoading?: boolean;
  onDownload?: () => void;
}

export function ChatThread({ messages, report, toolProgress = [], isLoading = false, onDownload }: ChatThreadProps) {
  const theme = useTheme();
  const reportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevReportRef = useRef<AuditReport | null>(null);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (!report) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, report]);

  // Auto-scroll to report accordion when it first appears
  useEffect(() => {
    if (report && !prevReportRef.current) {
      prevReportRef.current = report;
      // Small delay to let the accordion render
      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [report]);

  if (messages.length === 0) return null;

  return (
    <Box sx={{ p: 2, overflow: "auto", height: "100%", display: "flex", flexDirection: "column", ...scrollbarSx }}>
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {messages.map((msg) => (
          <Box key={msg.id} sx={{ flexShrink: 0 }}>
            {msg.role === "user" ? (
              <UserMessage text={msg.text} />
            ) : (
              <AssistantMessage message={msg} />
            )}
          </Box>
        ))}

        {/* Audit progress + activity feed — shows immediately when audit starts, collapses when done */}
        {(isLoading || toolProgress.length > 0) && (
          <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <AuditProgressAccordion toolProgress={toolProgress} isLoading={isLoading} />
          </Box>
        )}

        {/* Inline report accordion — appears after audit completes */}
        {report && (
          <Box ref={reportRef} sx={{ flexShrink: 0 }}>
            <Accordion
              defaultExpanded
              sx={{
                boxShadow: "none",
                border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                borderRadius: "12px !important",
                "&:before": { display: "none" },
                overflow: "hidden",
                bgcolor: alpha(theme.palette.primary.main, 0.02),
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  minHeight: 48,
                  "& .MuiAccordionSummary-content": { my: 1 },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
                  <ReportIcon sx={{ color: "primary.main", fontSize: 20 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Audit Report
                  </Typography>
                  <Chip
                    label={report.summary.overall_health.replace("_", " ").toUpperCase()}
                    size="small"
                    sx={{
                      fontSize: "0.65rem",
                      height: 20,
                      fontWeight: 600,
                      bgcolor:
                        report.summary.overall_health === "healthy"
                          ? alpha("#4caf50", 0.15)
                          : report.summary.overall_health === "needs_attention"
                          ? alpha("#ff9800", 0.15)
                          : alpha("#f44336", 0.15),
                      color:
                        report.summary.overall_health === "healthy"
                          ? "#4caf50"
                          : report.summary.overall_health === "needs_attention"
                          ? "#ff9800"
                          : "#f44336",
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {report.summary.total_objects} objects &middot; {report.summary.critical} critical &middot; {report.summary.warning} warning
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  {onDownload && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload();
                      }}
                      sx={{
                        textTransform: "none",
                        fontSize: "0.7rem",
                        borderRadius: 1.5,
                        borderColor: alpha(theme.palette.primary.main, 0.3),
                        "&:hover": { borderColor: "primary.main" },
                        mr: 1,
                      }}
                    >
                      Download Report
                    </Button>
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0, ...scrollbarSx }}>
                <Divider />
                <ReportPanel report={report} />
                {onDownload && (
                  <Box sx={{ px: 2, py: 1.5, display: "flex", justifyContent: "flex-end", borderTop: `1px solid ${alpha(theme.palette.divider, 0.3)}` }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                      onClick={onDownload}
                      sx={{
                        textTransform: "none",
                        fontSize: "0.7rem",
                        borderRadius: 1.5,
                        borderColor: alpha(theme.palette.primary.main, 0.3),
                        "&:hover": { borderColor: "primary.main" },
                      }}
                    >
                      Download Report
                    </Button>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          </Box>
        )}

        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
}

// Scrollbar styles for inner containers
const innerScrollbarSx = {
  "&::-webkit-scrollbar": { width: 4 },
  "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    bgcolor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
  },
  scrollbarWidth: "thin" as const,
  scrollbarColor: "rgba(255,255,255,0.08) transparent",
};

function AuditProgressAccordion({
  toolProgress,
  isLoading,
}: {
  toolProgress: ToolProgressEvent[];
  isLoading?: boolean;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const hasActivity = toolProgress.length > 0;

  // Auto-expand when first tool call arrives
  useEffect(() => {
    if (hasActivity && isLoading) {
      setExpanded(true);
    }
  }, [hasActivity, isLoading]);

  // Auto-collapse when audit completes or is stopped
  useEffect(() => {
    if (!isLoading && hasActivity) {
      setExpanded(false);
    }
  }, [isLoading, hasActivity]);

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, exp) => setExpanded(exp)}
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
        border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
        borderRadius: "12px !important",
        "&:before": { display: "none" },
        overflow: "hidden",
        bgcolor: alpha(theme.palette.info.main, 0.02),
        position: "relative",
        "& .MuiCollapse-root": { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
        "& .MuiCollapse-wrapper": { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
        "& .MuiCollapse-wrapperInner": { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          minHeight: 48,
          flexShrink: 0,
          position: "relative",
          "& .MuiAccordionSummary-content": { my: 1 },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <TimelineIcon sx={{ color: "info.main", fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Audit Progress
          </Typography>
          {!isLoading && toolProgress.length > 0 && (
            <Chip
              label={`${toolProgress.length} tool calls`}
              size="small"
              sx={{
                fontSize: "0.65rem",
                height: 20,
                fontWeight: 600,
                bgcolor: alpha(theme.palette.success.main, 0.15),
                color: theme.palette.success.main,
              }}
            />
          )}
        </Stack>
        {isLoading && (
          <LinearProgress
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              bgcolor: alpha(theme.palette.info.main, 0.08),
              "& .MuiLinearProgress-bar": {
                bgcolor: theme.palette.info.main,
              },
            }}
          />
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Divider />
        <Box sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}>
          <AuditPhase toolProgress={toolProgress} isLoading={isLoading ?? false} />
        </Box>
        <Divider sx={{ mx: 2, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", ...innerScrollbarSx }}>
          <ActivityFeed toolProgress={toolProgress} isLoading={isLoading ?? false} />
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

function UserMessage({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          bgcolor: alpha(theme.palette.primary.main, 0.15),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          mt: 0.5,
        }}
      >
        <UserIcon sx={{ fontSize: 16, color: "primary.main" }} />
      </Box>
      <Paper
        elevation={0}
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: 2,
          bgcolor:
            theme.palette.mode === "dark"
              ? alpha(theme.palette.primary.main, 0.08)
              : alpha(theme.palette.primary.main, 0.05),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
          maxWidth: "85%",
        }}
      >
        <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
          {text}
        </Typography>
      </Paper>
    </Stack>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  const hasThinking =
    message.thinkingSteps && message.thinkingSteps.length > 0;
  const hasContent = message.text || hasThinking;

  // Don't render empty assistant bubbles (e.g. status-only or pre-content streaming)
  if (!hasContent) return null;

  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          bgcolor: alpha(theme.palette.secondary.main, 0.15),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          mt: 0.5,
        }}
      >
        <BotIcon sx={{ fontSize: 16, color: "secondary.main" }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: "90%" }}>
        {/* Thinking Steps */}
        {hasThinking && (
          <Accordion
            defaultExpanded={false}
            sx={{
              mb: 1,
              boxShadow: "none",
              bgcolor: "transparent",
              border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
              borderRadius: "8px !important",
              "&:before": { display: "none" },
              overflow: "hidden",
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon fontSize="small" />}
              sx={{ minHeight: 36, "& .MuiAccordionSummary-content": { my: 0.5 } }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <ThinkingIcon sx={{ fontSize: 16, color: "secondary.main" }} />
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 600, color: "secondary.main" }}
                >
                  Thinking
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1 }}>
              <Divider sx={{ mb: 1 }} />
              <Stack spacing={0.5}>
                {message.thinkingSteps!.map((step, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{
                      fontStyle: "italic",
                      color: "text.secondary",
                      lineHeight: 1.5,
                      pl: 1,
                      borderLeft: `2px solid ${alpha(theme.palette.secondary.main, 0.3)}`,
                    }}
                  >
                    {step.length > 300 ? step.slice(0, 300) + "..." : step}
                  </Typography>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Status / Message Text — shown ABOVE tool calls */}
        {message.text && (
          <Paper
            elevation={0}
            sx={{
              px: 2,
              py: 1.5,
              mb: 0,
              borderRadius: 2,
              bgcolor:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.grey[800], 0.4)
                  : alpha(theme.palette.grey[100], 0.6),
              border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
              "& p": { margin: 0, lineHeight: 1.6 },
              "& p + p": { mt: 1 },
              "& code": {
                fontFamily: '"Fira Code", monospace',
                fontSize: "0.8rem",
                bgcolor: alpha(theme.palette.grey[500], 0.1),
                px: 0.5,
                py: 0.25,
                borderRadius: 0.5,
              },
              "& pre": {
                bgcolor: alpha(theme.palette.grey[900], 0.8),
                color: "#e0e0e0",
                p: 1.5,
                borderRadius: 1,
                overflow: "auto",
                fontSize: "0.8rem",
              },
            }}
          >
            <Typography variant="body2" component="div">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.text}
              </ReactMarkdown>
            </Typography>
          </Paper>
        )}


      </Box>
    </Stack>
  );
}
