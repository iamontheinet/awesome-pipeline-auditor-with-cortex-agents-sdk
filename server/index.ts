/**
 * Pipeline Auditor Express Backend
 *
 * Uses the Cortex Code Agent SDK (TypeScript) to run audits and stream
 * NDJSON events to the React frontend.
 */

import express from "express";
import { execSync } from "child_process";
import {
  createSession,
  type Session,
  type SessionOptions,
  type CortexCodeEvent,
  type PermissionResult,
  type HookOutput,
  type HookInput,
  type HookMatcher,
} from "cortex-code-agent-sdk";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Audit report JSON schema (matches Python schemas.py)
// ---------------------------------------------------------------------------
const AUDIT_REPORT_SCHEMA = {
  type: "object",
  properties: {
    database: { type: "string" },
    audit_timestamp: { type: "string" },
    pipeline_inventory: {
      type: "object",
      properties: {
        schemas: { type: "array", items: { type: "string" } },
        tables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
              type: { type: "string" },
              row_count: { type: "number" },
            },
            required: ["schema", "name", "type"],
          },
        },
        dynamic_tables: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
              target_lag: { type: "string" },
              refresh_mode: { type: "string" },
              scheduling_state: { type: "string" },
            },
            required: ["schema", "name"],
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
              schedule: { type: "string" },
              state: { type: "string" },
            },
            required: ["schema", "name"],
          },
        },
        views: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
            },
            required: ["schema", "name"],
          },
        },
        streams: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
              source_type: { type: "string" },
              table_name: { type: "string" },
              mode: { type: "string" },
              stale: { type: "boolean" },
              stale_after: { type: "string" },
            },
            required: ["schema", "name"],
          },
        },
        pipes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
              definition: { type: "string" },
              is_autoingest: { type: "boolean" },
              notification_channel: { type: "string" },
            },
            required: ["schema", "name"],
          },
        },
        procedures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema: { type: "string" },
              name: { type: "string" },
              language: { type: "string" },
              arguments: { type: "string" },
            },
            required: ["schema", "name"],
          },
        },
      },
      required: ["schemas", "tables", "dynamic_tables", "tasks", "views"],
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "freshness",
              "volume",
              "schema",
              "dt_health",
              "task_status",
              "data_quality",
              "pipeline_design",
              "stream_health",
              "pipe_status",
              "procedure_review",
            ],
          },
          severity: {
            type: "string",
            enum: ["critical", "warning", "info"],
          },
          object: { type: "string" },
          message: { type: "string" },
          details: { type: "object" },
        },
        required: ["category", "severity", "object", "message"],
      },
    },
    summary: {
      type: "object",
      properties: {
        total_objects: { type: "number" },
        critical: { type: "number" },
        warning: { type: "number" },
        info: { type: "number" },
        overall_health: {
          type: "string",
          enum: ["healthy", "needs_attention", "unhealthy"],
        },
      },
      required: [
        "total_objects",
        "critical",
        "warning",
        "info",
        "overall_health",
      ],
    },
  },
  required: [
    "database",
    "audit_timestamp",
    "pipeline_inventory",
    "findings",
    "summary",
  ],
};

// ---------------------------------------------------------------------------
// System prompt — composable sections keyed by audit scope
// ---------------------------------------------------------------------------
const PROMPT_PREAMBLE = `You are a Snowflake Data Pipeline Auditor. Your job is to comprehensively audit
a database's data pipeline by examining its objects, freshness, health, and quality.

WORKFLOW:
1. DISCOVER: Run the discovery queries below to build a complete pipeline inventory.
   - Schemas: SHOW SCHEMAS IN DATABASE <DATABASE>;`;

const PROMPT_SECTIONS: Record<string, string> = {
  tables_freshness: `
TABLES & FRESHNESS:
   - Tables and row counts:
     SELECT table_schema, table_name, table_type, row_count
     FROM <DATABASE>.INFORMATION_SCHEMA.TABLES
     WHERE table_schema NOT IN ('INFORMATION_SCHEMA')
     ORDER BY table_schema, table_name;
   - Check freshness — identify stale tables:
     SELECT table_schema, table_name, table_type, row_count, last_altered,
            DATEDIFF('hour', last_altered, CURRENT_TIMESTAMP()) AS hours_since_update,
            CASE
              WHEN DATEDIFF('hour', last_altered, CURRENT_TIMESTAMP()) > 168 THEN 'critical'
              WHEN DATEDIFF('hour', last_altered, CURRENT_TIMESTAMP()) > 24 THEN 'warning'
              ELSE 'fresh'
            END AS freshness_status
     FROM <DATABASE>.INFORMATION_SCHEMA.TABLES
     WHERE table_schema NOT IN ('INFORMATION_SCHEMA') AND table_type = 'BASE TABLE'
     ORDER BY hours_since_update DESC;
   - Check for row count anomalies (empty tables that shouldn't be)`,

  dynamic_tables: `
DYNAMIC TABLES:
   - Discover: SHOW DYNAMIC TABLES IN DATABASE <DATABASE>;
   - Check scheduling_state (should be ACTIVE)
   - Check refresh history for failures:
     SELECT name, state, state_message, refresh_start_time, refresh_end_time,
            DATEDIFF('second', refresh_start_time, refresh_end_time) AS duration_sec
     FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(NAME_PREFIX => '<DATABASE>.'))
     ORDER BY refresh_start_time DESC LIMIT 20;`,

  tasks: `
TASKS:
   - Discover: SHOW TASKS IN DATABASE <DATABASE>;
   - Check execution history for failures via TASK_HISTORY table function
   - Flag suspended tasks and tasks with recent failures`,

  views: `
VIEWS:
   - Discover views from INFORMATION_SCHEMA.TABLES WHERE table_type = 'VIEW'
   - Note materialized vs standard views`,

  streams: `
STREAMS:
   - Discover: SHOW STREAMS IN DATABASE <DATABASE>;
   - Check each stream's stale status (stale = true means the stream offset has fallen behind
     and data may be lost — this is CRITICAL)
   - Check stale_after timestamp — if it's approaching, flag as warning
   - Check mode (DEFAULT, APPEND_ONLY, INSERT_ONLY) and source_type
   - Flag streams on dropped or non-existent tables`,

  pipes: `
PIPES:
   - Discover: SHOW PIPES IN DATABASE <DATABASE>;
   - Check pipe status (RUNNING, STOPPED_CLONING, PAUSED, STALLED)
   - Check recent copy history for errors:
     SELECT pipe_name, file_name, status, first_error_message, first_error_line_number,
            last_load_time, row_count, row_parsed, error_count
     FROM TABLE(INFORMATION_SCHEMA.COPY_HISTORY(
       TABLE_NAME => '<DATABASE>.*',
       START_TIME => DATEADD('day', -7, CURRENT_TIMESTAMP())
     ))
     WHERE status != 'Loaded'
     ORDER BY last_load_time DESC LIMIT 30;
   - Flag pipes with high error rates or that are paused/stalled`,

  procedures: `
STORED PROCEDURES:
   - Discover: SHOW PROCEDURES IN DATABASE <DATABASE>;
   - Identify ETL-related procedures (look for INSERT, MERGE, COPY, CREATE TABLE AS patterns
     in procedure names or definitions)
   - Note the language (SQL, JavaScript, Python, Java, Scala) and whether they appear to be
     scheduled via tasks
   - Flag procedures that seem to be doing data movement but have no associated task (orphaned ETL)`,
};

const PROMPT_FOOTER = `
FINDING SEVERITY GUIDE:
- critical: Data stale beyond 7x threshold, DTs failing, tasks suspended, streams stale, pipes with errors
- warning: Data aging beyond threshold, DT lag exceeding target, design issues, approaching stale streams
- info: Observations, best practice suggestions, pipeline architecture notes

Replace <DATABASE> with the actual database name provided by the user.
Be thorough. Check every schema, every object type in scope. The user needs a complete picture.

For any object types NOT in scope, set their inventory arrays to empty arrays [] and skip those checks.`;

function buildSystemPrompt(database: string, scope: string[], schema: string): string {
  const allScopes = Object.keys(PROMPT_SECTIONS);
  // If no scope provided, use all sections (backwards compat)
  const activeScopes = scope.length > 0 ? scope : allScopes;

  let prompt = PROMPT_PREAMBLE;
  for (const key of allScopes) {
    if (activeScopes.includes(key)) {
      prompt += PROMPT_SECTIONS[key];
    }
  }
  prompt += PROMPT_FOOTER;

  // Add schema filter instruction if a specific schema was selected
  if (schema) {
    prompt += `\n\nIMPORTANT: Only audit objects in the ${schema} schema. Filter all SHOW and SELECT queries to this schema only. For INFORMATION_SCHEMA queries, add WHERE table_schema = '${schema}'.`;
  }

  return prompt.replace(/<DATABASE>/g, database);
}

// ---------------------------------------------------------------------------
// Read-only SQL guard (canUseTool)
// ---------------------------------------------------------------------------
const SAFE_PREFIXES = ["SELECT", "SHOW", "DESCRIBE", "DESC", "WITH", "EXPLAIN"];
const BLOCKED_TOOLS = new Set(["Write", "Edit", "Bash"]);

async function readOnlyGuard(
  toolName: string,
  toolInput: Record<string, unknown>,
  _context: unknown
): Promise<PermissionResult> {
  if (toolName === "sql_execute") {
    const sql = String(toolInput.sql || "").trim().toUpperCase();
    if (!SAFE_PREFIXES.some((p) => sql.startsWith(p))) {
      return {
        behavior: "deny" as const,
        message: `Blocked: only read-only SQL allowed in audit mode. Got: ${sql.slice(0, 60)}...`,
      };
    }
  }
  if (BLOCKED_TOOLS.has(toolName)) {
    return {
      behavior: "deny" as const,
      message: `Blocked: ${toolName} is not allowed in audit mode.`,
    };
  }
  return { behavior: "allow" as const };
}

// ---------------------------------------------------------------------------
// Session management (one active session at a time)
// ---------------------------------------------------------------------------
let activeSession: Session | null = null;

function ndjsonLine(data: Record<string, unknown>): string {
  return JSON.stringify(data) + "\n";
}

// ---------------------------------------------------------------------------
// GET /api/connections — list available Snowflake connections
// ---------------------------------------------------------------------------
app.get("/api/connections", (_req, res) => {
  try {
    const raw = execSync("cortex connections list", {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    const parsed = JSON.parse(raw);
    res.json({
      active: parsed.active_connection || "",
      connections: Object.keys(parsed.connections || {}),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list connections", detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/databases?connection=<name> — list databases for a connection
// ---------------------------------------------------------------------------
app.get("/api/databases", (req, res) => {
  const connection = String(req.query.connection || "");
  if (!connection || !/^[\w-]+$/.test(connection)) {
    res.status(400).json({ error: "Invalid connection name" });
    return;
  }
  try {
    const raw = execSync(
      `snow sql -q "SHOW DATABASES" -c ${connection} --format json`,
      { encoding: "utf-8", timeout: 15_000, env: { ...process.env, PATH: process.env.PATH } }
    );
    const rows = JSON.parse(raw) as Array<{ name: string }>;
    const databases = rows.map((r) => r.name).filter(Boolean).sort();
    res.json({ databases });
  } catch (err) {
    res.status(500).json({ error: "Failed to list databases", detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/schemas?connection=<name>&database=<name> — list schemas
// ---------------------------------------------------------------------------
app.get("/api/schemas", (req, res) => {
  const connection = String(req.query.connection || "");
  const database = String(req.query.database || "");
  if (!connection || !/^[\w-]+$/.test(connection)) {
    res.status(400).json({ error: "Invalid connection name" });
    return;
  }
  if (!database || !/^[\w-]+$/.test(database)) {
    res.status(400).json({ error: "Invalid database name" });
    return;
  }
  try {
    const raw = execSync(
      `snow sql -q "SHOW SCHEMAS IN DATABASE ${database}" -c ${connection} --format json`,
      { encoding: "utf-8", timeout: 15_000, env: { ...process.env, PATH: process.env.PATH } }
    );
    const rows = JSON.parse(raw) as Array<{ name: string }>;
    const schemas = rows
      .map((r) => r.name)
      .filter((s) => s !== "INFORMATION_SCHEMA")
      .sort();
    res.json({ schemas });
  } catch (err) {
    res.status(500).json({ error: "Failed to list schemas", detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/audit — start a new audit
// ---------------------------------------------------------------------------
app.post("/api/audit", async (req, res) => {
  const { database = "AUTOMATED_INTELLIGENCE", connection = "dash-builder-si", scope = [], schema = "" } =
    req.body || {};

  // Clean up previous session (with timeout to avoid hanging)
  if (activeSession) {
    const prev = activeSession;
    activeSession = null;
    try {
      await Promise.race([
        prev.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("close timeout")), 5000)),
      ]);
    } catch {
      /* ignore — session may already be dead */
    }
  }

  // Track client disconnection + stream iterator for cancellation
  let clientDisconnected = false;
  let streamIterator: AsyncIterableIterator<unknown> | null = null;
  req.on("close", () => {
    clientDisconnected = true;
    // Break the for-await loop immediately by returning the iterator
    if (streamIterator) {
      streamIterator.return?.(undefined).catch(() => {});
      streamIterator = null;
    }
    // Close the SDK session
    if (activeSession) {
      const sess = activeSession;
      activeSession = null;
      sess.close().catch(() => {});
    }
  });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const toolCounter = { count: 0, start: Date.now() };

  // PostToolUse hook — streams progress to the client
  const progressHook = async (
    input: HookInput,
    _toolUseId: string | null,
    _context: unknown
  ): Promise<HookOutput> => {
    if (clientDisconnected) return {};
    toolCounter.count++;
    const elapsed = ((Date.now() - toolCounter.start) / 1000).toFixed(1);
    const toolName = input.tool_name || "unknown";

    const event: Record<string, unknown> = {
      type: "tool_progress",
      toolName,
      count: toolCounter.count,
      elapsed: Number(elapsed),
    };

    if (toolName === "sql_execute") {
      const sqlInput = input.tool_input as Record<string, unknown> | undefined;
      event.sqlPreview = String(sqlInput?.sql || "")
        .slice(0, 120)
        .replace(/\n/g, " ");
      event.description = sqlInput?.description || "";
    }

    try {
      res.write(ndjsonLine(event));
    } catch {
      /* client disconnected */
    }
    return {};
  };

  const hookMatchers: HookMatcher[] = [
    { matcher: ".*", hooks: [progressHook] },
  ];

  const options: SessionOptions = {
    connection,
    cwd: "/tmp",
    systemPrompt: buildSystemPrompt(database, scope, schema),
    model: "auto",
    maxTurns: 20,
    canUseTool: readOnlyGuard,
    hooks: {
      PostToolUse: hookMatchers,
    },
    outputFormat: {
      type: "json_schema",
      schema: AUDIT_REPORT_SCHEMA,
    },
    disallowedTools: ["Write", "Edit"],
    settingSources: [],
  };

  try {
    res.write(
      ndjsonLine({
        type: "status",
        message: "Starting audit session...",
        database,
        connection,
      })
    );

    activeSession = await createSession(options);

    res.write(ndjsonLine({ type: "status", message: "Session connected. Running audit..." }));

    // Send the audit prompt
    const scopeLabels: Record<string, string> = {
      tables_freshness: "tables & freshness",
      dynamic_tables: "dynamic tables",
      tasks: "tasks",
      views: "views",
      streams: "streams",
      pipes: "pipes",
      procedures: "stored procedures",
    };
    const activeScope = (scope as string[]).length > 0 ? scope as string[] : Object.keys(PROMPT_SECTIONS);
    const scopeDesc = activeScope.map((s: string) => scopeLabels[s] || s).join(", ");
    const schemaClause = schema ? ` Limit to schema: ${schema}.` : "";
    const prompt = `Run a comprehensive pipeline audit on the ${database} database. Scope: ${scopeDesc}.${schemaClause} Discover all in-scope objects, run the checks described in the system prompt for each scope area, and return the full structured audit report.`;

    await activeSession.send(prompt);

    // Stream events — capture iterator so req.on('close') can break the loop
    let report: unknown = null;
    let reportEmitted = false;
    const stream = activeSession.stream() as AsyncIterableIterator<Record<string, unknown>>;
    streamIterator = stream as AsyncIterableIterator<unknown>;
    for await (const event of stream) {
      // Bail out immediately if client disconnected
      if (clientDisconnected) break;

      try {
        if (event.type === "assistant") {
          // Extract text and tool_use blocks from assistant messages
          for (const block of event.content) {
            if (block.type === "text" && block.text.trim()) {
              // Try to parse as structured report JSON
              try {
                const parsed = JSON.parse(block.text);
                if (parsed.findings) {
                  report = parsed;
                  reportEmitted = true;
                  res.write(ndjsonLine({ type: "report", report: parsed }));
                  // Emit result immediately and stop — the audit is done
                  res.write(
                    ndjsonLine({
                      type: "result",
                      isError: false,
                      numTurns: 0,
                      durationMs: Date.now() - toolCounter.start,
                      toolCalls: toolCounter.count,
                    })
                  );
                }
              } catch {
                // Not JSON — skip narrative text during audit entirely.
                // The tool calls stream provides progress, and the report
                // accordion provides the final structured output.
              }
            } else if (block.type === "tool_use") {
              res.write(
                ndjsonLine({
                  type: "tool_use",
                  toolName: block.name,
                  toolId: block.id,
                  input: block.input,
                })
              );
            } else if (block.type === "thinking") {
              res.write(
                ndjsonLine({ type: "thinking", text: block.thinking })
              );
            }
          }
          // If we just emitted the report, stop the stream
          if (reportEmitted) break;
        } else if (event.type === "result") {
          const resultEvent: Record<string, unknown> = {
            type: "result",
            isError: event.is_error,
            numTurns: event.num_turns,
            durationMs: event.duration_ms,
            toolCalls: toolCounter.count,
          };

          if (!event.is_error && event.subtype === "success") {
            if (event.structured_output && !report) {
              report = event.structured_output;
              resultEvent.report = event.structured_output;
            }
            resultEvent.usage = event.usage;
          }

          res.write(ndjsonLine(resultEvent));
          break;
        }
      } catch {
        // Write error, client likely disconnected
        break;
      }
    }

    streamIterator = null; // Clean up iterator reference

    if (!clientDisconnected) {
      try { res.end(); } catch { /* already closed */ }
    }
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Audit error:", msg);
    if (!clientDisconnected) {
      try {
        res.write(ndjsonLine({ type: "error", message: msg }));
        res.end();
      } catch {
        /* already closed */
      }
    }
  }
});

// ---------------------------------------------------------------------------
// POST /api/chat — send a follow-up message to the active session
// ---------------------------------------------------------------------------
app.post("/api/chat", async (req, res) => {
  const { message } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }

  if (!activeSession) {
    return res.status(400).json({ error: "No active audit session. Run an audit first." });
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    await activeSession.send(message);

    for await (const event of activeSession.stream()) {
      try {
        if (event.type === "assistant") {
          for (const block of event.content) {
            if (block.type === "text" && block.text.trim()) {
              res.write(ndjsonLine({ type: "text", text: block.text }));
            } else if (block.type === "tool_use") {
              res.write(
                ndjsonLine({
                  type: "tool_use",
                  toolName: block.name,
                  toolId: block.id,
                  input: block.input,
                })
              );
            } else if (block.type === "thinking") {
              res.write(
                ndjsonLine({ type: "thinking", text: block.thinking })
              );
            }
          }
        } else if (event.type === "result") {
          res.write(
            ndjsonLine({
              type: "result",
              isError: event.is_error,
              numTurns: event.num_turns,
              durationMs: event.duration_ms,
            })
          );
          break;
        }
      } catch {
        break;
      }
    }

    res.end();
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Chat error:", msg);
    try {
      res.write(ndjsonLine({ type: "error", message: msg }));
      res.end();
    } catch {
      /* already closed */
    }
  }
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasActiveSession: !!activeSession,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\nPipeline Auditor backend running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/audit  — Start a new audit`);
  console.log(`  POST /api/chat   — Send follow-up message`);
  console.log(`  GET  /api/health — Health check\n`);
});

process.on("SIGTERM", async () => {
  if (activeSession) await activeSession.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  if (activeSession) await activeSession.close();
  process.exit(0);
});
