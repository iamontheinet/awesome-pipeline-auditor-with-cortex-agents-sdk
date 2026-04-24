/**
 * Pipeline Auditor Express Backend
 *
 * Uses the Cortex Code Agent SDK (TypeScript) to run audits and stream
 * NDJSON events to the React frontend.
 */
import express from "express";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createSession, } from "cortex-code-agent-sdk";
const app = express();
app.use(express.json());
// Request logger for debugging SPCS ingress issues
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
// In production, serve the Vite build output
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");
if (process.env.NODE_ENV === "production") {
    app.use(express.static(distDir));
}
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
const PROMPT_PREAMBLE_ALL_SCHEMAS = `You are a Snowflake Data Pipeline Auditor. Your job is to comprehensively audit
a database's data pipeline by examining its objects, freshness, health, and quality.

WORKFLOW:
1. DISCOVER: Run the discovery queries below to build a complete pipeline inventory.
   - Schemas: SHOW SCHEMAS IN DATABASE <DATABASE>;`;
const PROMPT_PREAMBLE_SINGLE_SCHEMA = `You are a Snowflake Data Pipeline Auditor. Your job is to comprehensively audit
a specific schema's data pipeline by examining its objects, freshness, health, and quality.

CRITICAL CONSTRAINT: You are auditing ONLY the <SCHEMA> schema in the <DATABASE> database.
- NEVER run SHOW SCHEMAS. The schema is already known: <SCHEMA>.
- NEVER audit objects outside <DATABASE>.<SCHEMA>.
- All SHOW commands must use IN SCHEMA <DATABASE>.<SCHEMA> (not IN DATABASE).
- All INFORMATION_SCHEMA queries must filter with WHERE table_schema = '<SCHEMA>'.

WORKFLOW:
1. DISCOVER: Run the discovery queries below scoped to <DATABASE>.<SCHEMA>. Skip schema discovery — go directly to object discovery.`;
const PROMPT_SECTIONS = {
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
      FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLE_REFRESH_HISTORY(NAME_PREFIX => '<DT_NAME_PREFIX>'))
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
function buildSystemPrompt(database, scope, schema) {
    const allScopes = Object.keys(PROMPT_SECTIONS);
    // If no scope provided, use all sections (backwards compat)
    const activeScopes = scope.length > 0 ? scope : allScopes;
    let prompt = schema ? PROMPT_PREAMBLE_SINGLE_SCHEMA : PROMPT_PREAMBLE_ALL_SCHEMAS;
    for (const key of allScopes) {
        if (activeScopes.includes(key)) {
            prompt += PROMPT_SECTIONS[key];
        }
    }
    prompt += PROMPT_FOOTER;
    // Replace placeholders
    prompt = prompt.replace(/<DATABASE>/g, database);
    // DT name prefix: schema-scoped if schema selected, otherwise database-wide
    const dtPrefix = schema ? `${database}.${schema}.` : `${database}.`;
    prompt = prompt.replace(/<DT_NAME_PREFIX>/g, dtPrefix);
    // When a specific schema is selected, rewrite SHOW/query targets to scope to that schema
    if (schema) {
        prompt = prompt
            .replace(/<SCHEMA>/g, schema)
            // SHOW X IN DATABASE DB → SHOW X IN SCHEMA DB.SCHEMA
            .replace(new RegExp(`SHOW (\\w+(?:\\s+\\w+)?) IN DATABASE ${database}`, "g"), `SHOW $1 IN SCHEMA ${database}.${schema}`)
            // INFORMATION_SCHEMA queries: tighten WHERE clause
            .replace(/WHERE table_schema NOT IN \('INFORMATION_SCHEMA'\)/g, `WHERE table_schema = '${schema}'`)
            // Replace generic "Check every schema" with schema-specific instruction
            .replace(/Be thorough\. Check every schema, every object type in scope\./, `Be thorough. Check every object type in scope within the ${schema} schema.`);
    }
    return prompt;
}
// ---------------------------------------------------------------------------
// Read-only SQL guard (canUseTool)
// ---------------------------------------------------------------------------
const SAFE_PREFIXES = ["SELECT", "SHOW", "DESCRIBE", "DESC", "WITH", "EXPLAIN"];
const BLOCKED_TOOLS = new Set(["Write", "Edit", "Bash"]);
async function readOnlyGuard(toolName, toolInput, _context) {
    if (toolName === "sql_execute") {
        const sql = String(toolInput.sql || "").trim().toUpperCase();
        if (!SAFE_PREFIXES.some((p) => sql.startsWith(p))) {
            return {
                behavior: "deny",
                message: `Blocked: only read-only SQL allowed in audit mode. Got: ${sql.slice(0, 60)}...`,
            };
        }
    }
    if (BLOCKED_TOOLS.has(toolName)) {
        return {
            behavior: "deny",
            message: `Blocked: ${toolName} is not allowed in audit mode.`,
        };
    }
    return { behavior: "allow" };
}
// ---------------------------------------------------------------------------
// Session management (one active session at a time)
// ---------------------------------------------------------------------------
let activeSession = null;
let fixJobActive = false; // Only one suggest-fix job at a time
let fixSession = null; // Kept alive for follow-up chat
const jobStore = new Map();
function pushJobEvent(jobId, event) {
    const job = jobStore.get(jobId);
    if (job)
        job.events.push(event);
}
// Clean up old jobs after 30 minutes
setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, job] of jobStore) {
        if (job.done && job.events.length > 0) {
            // Check first event timestamp (we embed _ts in status events)
            const first = job.events[0];
            if (first._ts && first._ts < cutoff) {
                jobStore.delete(id);
            }
        }
    }
}, 5 * 60 * 1000);
// ---------------------------------------------------------------------------
// GET /api/databases — list databases visible to the service role
// ---------------------------------------------------------------------------
app.get("/api/databases", (_req, res) => {
    try {
        const rows = snowSql("SHOW DATABASES");
        const databases = rows.map((r) => r.name).filter(Boolean).sort();
        res.json({ databases });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to list databases", detail: String(err) });
    }
});
// ---------------------------------------------------------------------------
// GET /api/schemas?database=<name> — list schemas in a database
// ---------------------------------------------------------------------------
app.get("/api/schemas", (req, res) => {
    const database = String(req.query.database || "");
    if (!database || !/^[\w-]+$/.test(database)) {
        res.status(400).json({ error: "Invalid database name" });
        return;
    }
    try {
        const rows = snowSql(`SHOW SCHEMAS IN DATABASE ${database}`);
        const schemas = rows
            .map((r) => r.name)
            .filter((s) => s !== "INFORMATION_SCHEMA")
            .sort();
        res.json({ schemas });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to list schemas", detail: String(err) });
    }
});
// ---------------------------------------------------------------------------
// POST /api/audit — start a new audit (poll-based: returns jobId immediately)
// ---------------------------------------------------------------------------
app.post("/api/audit", async (req, res) => {
    const { database = "AUTOMATED_INTELLIGENCE", scope = [], schema = "" } = req.body || {};
    const connection = DEFAULT_CONNECTION;
    // Clean up previous session (with timeout to avoid hanging)
    if (activeSession) {
        const prev = activeSession;
        activeSession = null;
        try {
            await Promise.race([
                prev.close(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("close timeout")), 5000)),
            ]);
        }
        catch {
            /* ignore — session may already be dead */
        }
    }
    // Create job entry
    const jobId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, { events: [], done: false });
    pushJobEvent(jobId, {
        type: "status",
        message: "Starting audit session...",
        database,
        connection,
        _ts: Date.now(),
    });
    // Return jobId immediately — frontend will poll GET /api/audit/progress/:jobId
    res.json({ jobId });
    // Run the audit in the background (fire-and-forget)
    runAuditJob(jobId, database, scope, schema, connection).catch((err) => {
        console.error("Audit job error:", err);
    });
});
// Background audit runner — pushes events into the job store
async function runAuditJob(jobId, database, scope, schema, connection, sendEmail = false) {
    const job = jobStore.get(jobId);
    if (!job)
        return;
    const toolCounter = { count: 0, start: Date.now() };
    // PostToolUse hook — pushes progress to the job buffer
    const progressHook = async (input, _toolUseId, _context) => {
        toolCounter.count++;
        const elapsed = ((Date.now() - toolCounter.start) / 1000).toFixed(1);
        const toolName = input.tool_name || "unknown";
        const event = {
            type: "tool_progress",
            toolName,
            count: toolCounter.count,
            elapsed: Number(elapsed),
        };
        if (toolName === "sql_execute") {
            const sqlInput = input.tool_input;
            event.sqlPreview = String(sqlInput?.sql || "")
                .slice(0, 120)
                .replace(/\n/g, " ");
            event.description = sqlInput?.description || "";
        }
        pushJobEvent(jobId, event);
        return {};
    };
    const hookMatchers = [
        { matcher: ".*", hooks: [progressHook] },
    ];
    const options = {
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
        console.log("Creating cortex session with connection:", connection);
        activeSession = await Promise.race([
            createSession(options),
            new Promise((_, reject) => setTimeout(() => reject(new Error("createSession timed out after 60s")), 60_000)),
        ]);
        console.log("Session created successfully");
        pushJobEvent(jobId, { type: "status", message: "Session connected. Running audit..." });
        // Build and send audit prompt
        const scopeLabels = {
            tables_freshness: "tables & freshness",
            dynamic_tables: "dynamic tables",
            tasks: "tasks",
            views: "views",
            streams: "streams",
            pipes: "pipes",
            procedures: "stored procedures",
        };
        const activeScope = scope.length > 0 ? scope : Object.keys(PROMPT_SECTIONS);
        const scopeDesc = activeScope.map((s) => scopeLabels[s] || s).join(", ");
        const schemaClause = schema ? ` Only audit the ${database}.${schema} schema — do NOT run SHOW SCHEMAS or look at any other schema.` : "";
        const prompt = schema
            ? `Run a comprehensive pipeline audit on ${database}.${schema}. Scope: ${scopeDesc}.${schemaClause} Run the checks described in the system prompt for each scope area directly against ${database}.${schema} and return the full structured audit report.`
            : `Run a comprehensive pipeline audit on the ${database} database. Scope: ${scopeDesc}. Discover all in-scope objects, run the checks described in the system prompt for each scope area, and return the full structured audit report.`;
        await activeSession.send(prompt);
        // Stream events into the job buffer
        let report = null;
        let reportEmitted = false;
        const stream = activeSession.stream();
        for await (const event of stream) {
            if (event.type === "assistant") {
                for (const block of event.content) {
                    if (block.type === "text" && block.text.trim()) {
                        try {
                            const parsed = JSON.parse(block.text);
                            if (parsed.findings) {
                                report = parsed;
                                reportEmitted = true;
                                pushJobEvent(jobId, { type: "report", report: parsed });
                                pushJobEvent(jobId, {
                                    type: "result",
                                    isError: false,
                                    numTurns: 0,
                                    durationMs: Date.now() - toolCounter.start,
                                    toolCalls: toolCounter.count,
                                });
                            }
                        }
                        catch {
                            // Not JSON — skip narrative text
                        }
                    }
                    else if (block.type === "tool_use") {
                        pushJobEvent(jobId, {
                            type: "tool_use",
                            toolName: block.name,
                            toolId: block.id,
                            input: block.input,
                        });
                    }
                    else if (block.type === "thinking") {
                        pushJobEvent(jobId, { type: "thinking", text: block.thinking });
                    }
                }
                if (reportEmitted)
                    break;
            }
            else if (event.type === "result") {
                const resultEvent = {
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
                pushJobEvent(jobId, resultEvent);
                break;
            }
        }
        // Send email report if requested
        if (sendEmail && report) {
            const durationMs = Date.now() - toolCounter.start;
            sendReportEmail(report, database, schema, durationMs, toolCounter.count);
        }
        job.done = true;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Audit job error:", msg);
        pushJobEvent(jobId, { type: "error", message: msg });
        job.done = true;
        job.error = msg;
    }
}
// ---------------------------------------------------------------------------
// GET /api/audit/progress/:jobId — poll for new events
// ---------------------------------------------------------------------------
app.get("/api/audit/progress/:jobId", (req, res) => {
    const { jobId } = req.params;
    const after = parseInt(String(req.query.after || "0"), 10);
    const job = jobStore.get(jobId);
    if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
    }
    const newEvents = job.events.slice(after);
    res.json({
        events: newEvents,
        cursor: job.events.length,
        done: job.done,
    });
});
// ---------------------------------------------------------------------------
// POST /api/chat — send a follow-up message (poll-based: returns jobId)
// ---------------------------------------------------------------------------
app.post("/api/chat", async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
    }
    if (!activeSession) {
        return res.status(400).json({ error: "No active audit session. Run an audit first." });
    }
    const jobId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, { events: [], done: false });
    res.json({ jobId });
    // Run chat in the background
    runChatJob(jobId, message).catch((err) => {
        console.error("Chat job error:", err);
    });
});
// Background chat runner
async function runChatJob(jobId, message) {
    const job = jobStore.get(jobId);
    if (!job || !activeSession) {
        if (job) {
            pushJobEvent(jobId, { type: "error", message: "No active audit session." });
            job.done = true;
        }
        return;
    }
    try {
        await activeSession.send(message);
        for await (const event of activeSession.stream()) {
            if (event.type === "assistant") {
                for (const block of event.content) {
                    if (block.type === "text" && block.text.trim()) {
                        pushJobEvent(jobId, { type: "text", text: block.text });
                    }
                    else if (block.type === "tool_use") {
                        pushJobEvent(jobId, {
                            type: "tool_use",
                            toolName: block.name,
                            toolId: block.id,
                            input: block.input,
                        });
                    }
                    else if (block.type === "thinking") {
                        pushJobEvent(jobId, { type: "thinking", text: block.thinking });
                    }
                }
            }
            else if (event.type === "result") {
                pushJobEvent(jobId, {
                    type: "result",
                    isError: event.is_error,
                    numTurns: event.num_turns,
                    durationMs: event.duration_ms,
                });
                break;
            }
        }
        job.done = true;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Chat error:", msg);
        pushJobEvent(jobId, { type: "error", message: msg });
        job.done = true;
        job.error = msg;
    }
}
// ---------------------------------------------------------------------------
// POST /api/suggest-fix — ask CoCo to suggest a fix for a specific finding
// ---------------------------------------------------------------------------
app.post("/api/suggest-fix", async (req, res) => {
    const { finding, database } = req.body || {};
    if (!finding || !database) {
        return res.status(400).json({ error: "finding and database are required" });
    }
    if (fixJobActive) {
        return res.status(409).json({ error: "A fix is already in progress. Wait for it to finish or dismiss it." });
    }
    fixJobActive = true;
    const jobId = `fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, { events: [], done: false });
    // Close any previous fix session
    if (fixSession) {
        const prev = fixSession;
        fixSession = null;
        prev.close().catch(() => { });
    }
    res.json({ jobId });
    // Run in background
    runSuggestFixJob(jobId, finding, database).catch((err) => {
        console.error("Suggest fix job error:", err);
    }).finally(() => {
        fixJobActive = false;
    });
});
// Background suggest-fix runner — always uses a fresh ephemeral session
async function runSuggestFixJob(jobId, finding, database) {
    const job = jobStore.get(jobId);
    if (!job)
        return;
    const prompt = `Suggest a concrete fix for this pipeline audit finding on the ${database} database.

Finding:
- Severity: ${finding.severity}
- Category: ${finding.category}
- Object: ${finding.object}
- Message: ${finding.message}${finding.details ? `\n- Details: ${JSON.stringify(finding.details)}` : ""}

Rules:
- Do NOT run any tools or queries. Respond with your answer directly.
- Provide exact SQL commands in fenced code blocks where applicable.
- Explain briefly why the fix works.
- Keep the response under 500 words.`;
    try {
        const connection = DEFAULT_CONNECTION;
        const ephemeralOptions = {
            connection,
            cwd: "/tmp",
            systemPrompt: `You are a Snowflake pipeline remediation expert. When given a finding, respond with a clear, actionable fix. Use SQL code blocks for any commands. Give the answer directly from your expertise. If the user asks you to run SQL, you may use sql_execute to run it against Snowflake. Target database: ${database}.`,
            model: "auto",
            maxTurns: 10,
            canUseTool: readOnlyGuard,
            disallowedTools: ["Write", "Edit", "Bash", "Glob", "Grep", "Read"],
            settingSources: [],
        };
        const ephemeralSession = await Promise.race([
            createSession(ephemeralOptions),
            new Promise((_, reject) => setTimeout(() => reject(new Error("createSession timed out after 30s")), 30_000)),
        ]);
        await ephemeralSession.send(prompt);
        for await (const event of ephemeralSession.stream()) {
            if (event.type === "assistant") {
                for (const block of event.content) {
                    if (block.type === "text" && block.text.trim()) {
                        pushJobEvent(jobId, { type: "text", text: block.text });
                    }
                }
            }
            else if (event.type === "result") {
                pushJobEvent(jobId, {
                    type: "result",
                    isError: event.is_error,
                    numTurns: event.num_turns,
                    durationMs: event.duration_ms,
                });
                break;
            }
        }
        // Keep session alive for follow-up chat
        fixSession = ephemeralSession;
        job.done = true;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Suggest-fix error:", msg);
        pushJobEvent(jobId, { type: "error", message: msg });
        job.done = true;
        job.error = msg;
    }
}
// ---------------------------------------------------------------------------
// POST /api/suggest-fix/chat — follow-up question in the fix session
// ---------------------------------------------------------------------------
app.post("/api/suggest-fix/chat", async (req, res) => {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "message is required" });
    }
    if (!fixSession) {
        return res.status(400).json({ error: "No active fix session. Request a fix first." });
    }
    if (fixJobActive) {
        return res.status(409).json({ error: "A fix response is still generating." });
    }
    fixJobActive = true;
    const jobId = `fixchat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, { events: [], done: false });
    res.json({ jobId });
    runFixChatJob(jobId, message).catch((err) => {
        console.error("Fix chat job error:", err);
    }).finally(() => {
        fixJobActive = false;
    });
});
async function runFixChatJob(jobId, message) {
    const job = jobStore.get(jobId);
    if (!job || !fixSession) {
        if (job) {
            pushJobEvent(jobId, { type: "error", message: "No active fix session." });
            job.done = true;
        }
        return;
    }
    try {
        await fixSession.send(message);
        for await (const event of fixSession.stream()) {
            if (event.type === "assistant") {
                for (const block of event.content) {
                    if (block.type === "text" && block.text.trim()) {
                        pushJobEvent(jobId, { type: "text", text: block.text });
                    }
                }
            }
            else if (event.type === "result") {
                pushJobEvent(jobId, {
                    type: "result",
                    isError: event.is_error,
                    numTurns: event.num_turns,
                    durationMs: event.duration_ms,
                });
                break;
            }
        }
        job.done = true;
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Fix chat error:", msg);
        pushJobEvent(jobId, { type: "error", message: msg });
        job.done = true;
        job.error = msg;
    }
}
// ---------------------------------------------------------------------------
// POST /api/suggest-fix/dismiss — close the fix session
// ---------------------------------------------------------------------------
app.post("/api/suggest-fix/dismiss", async (_req, res) => {
    if (fixSession) {
        const prev = fixSession;
        fixSession = null;
        prev.close().catch(() => { });
    }
    fixJobActive = false;
    res.json({ ok: true });
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
// Helper: run snow sql and return parsed JSON rows
// ---------------------------------------------------------------------------
const SNOW = process.env.SNOW_PATH || "snow";
const DEFAULT_CONNECTION = process.env.SNOW_CONNECTION || "dash-builder-si";
const SNOW_SQL_PY = path.resolve(__dirname, "..", "snow_sql.py");
function snowSql(sql, _connection = DEFAULT_CONNECTION) {
    const raw = execSync(`python3 ${SNOW_SQL_PY} "${sql.replace(/"/g, '\\"')}"`, { encoding: "utf-8", timeout: 30_000, env: { ...process.env, PATH: process.env.PATH } });
    return JSON.parse(raw);
}
// ---------------------------------------------------------------------------
// Email report — sends HTML-formatted audit report via SYSTEM$SEND_EMAIL
// ---------------------------------------------------------------------------
const EMAIL_INTEGRATION = "DASH_AT_SNOWFLAKE_EMAIL_INT";
const EMAIL_RECIPIENT = "dash.desai@snowflake.com";
function buildReportHtml(report, database, schema, durationMs, toolCalls) {
    const summary = report.summary || {};
    const findings = (report.findings || []);
    const timestamp = report.audit_timestamp || new Date().toISOString();
    const health = String(summary.overall_health || "unknown");
    const target = schema ? `${database}.${schema}` : database;
    const healthColor = {
        healthy: "#4caf50",
        needs_attention: "#ff9800",
        unhealthy: "#f44336",
        unknown: "#9e9e9e",
    };
    const severityColor = {
        critical: "#f44336",
        warning: "#ff9800",
        info: "#29B5E8",
    };
    const findingsRows = findings.map((f) => {
        const sev = String(f.severity || "info");
        const color = severityColor[sev] || "#9e9e9e";
        return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2f3a;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${color};">${sev.toUpperCase()}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2f3a;color:#b0bec5;font-size:12px;">${String(f.category || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2f3a;color:#e0e0e0;font-family:monospace;font-size:12px;">${String(f.object || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2f3a;color:#cfd8dc;font-size:13px;">${String(f.message || "")}</td>
    </tr>`;
    }).join("");
    const durationSec = (durationMs / 1000).toFixed(1);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:800px;margin:0 auto;padding:24px;">
    <!-- Header -->
    <div style="background:#1a1f2b;border-radius:12px;padding:24px;margin-bottom:16px;border:1px solid #2a2f3a;">
      <h1 style="margin:0 0 4px;font-size:20px;color:#e0e0e0;">Pipeline Audit Report</h1>
      <p style="margin:0;color:#78909c;font-size:13px;">${target} &bull; ${timestamp}</p>
    </div>

    <!-- Summary -->
    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="flex:1;background:#1a1f2b;border-radius:10px;padding:16px;text-align:center;border:1px solid #2a2f3a;">
        <div style="font-size:28px;font-weight:700;color:${healthColor[health] || "#9e9e9e"};">${health.replace(/_/g, " ").toUpperCase()}</div>
        <div style="font-size:11px;color:#78909c;margin-top:4px;">Overall Health</div>
      </div>
      <div style="flex:1;background:#1a1f2b;border-radius:10px;padding:16px;text-align:center;border:1px solid #2a2f3a;">
        <div style="font-size:28px;font-weight:700;color:#e0e0e0;">${summary.total_objects ?? 0}</div>
        <div style="font-size:11px;color:#78909c;margin-top:4px;">Objects Audited</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="flex:1;background:#1a1f2b;border-radius:10px;padding:12px;text-align:center;border:1px solid #2a2f3a;">
        <span style="font-size:22px;font-weight:700;color:#f44336;">${summary.critical ?? 0}</span>
        <span style="font-size:11px;color:#78909c;margin-left:6px;">Critical</span>
      </div>
      <div style="flex:1;background:#1a1f2b;border-radius:10px;padding:12px;text-align:center;border:1px solid #2a2f3a;">
        <span style="font-size:22px;font-weight:700;color:#ff9800;">${summary.warning ?? 0}</span>
        <span style="font-size:11px;color:#78909c;margin-left:6px;">Warning</span>
      </div>
      <div style="flex:1;background:#1a1f2b;border-radius:10px;padding:12px;text-align:center;border:1px solid #2a2f3a;">
        <span style="font-size:22px;font-weight:700;color:#29B5E8;">${summary.info ?? 0}</span>
        <span style="font-size:11px;color:#78909c;margin-left:6px;">Info</span>
      </div>
    </div>

    <!-- Stats -->
    <div style="background:#1a1f2b;border-radius:10px;padding:12px 16px;margin-bottom:16px;border:1px solid #2a2f3a;color:#78909c;font-size:12px;">
      Duration: ${durationSec}s &bull; Tool calls: ${toolCalls} &bull; Findings: ${findings.length}
    </div>

    <!-- Findings Table -->
    ${findings.length > 0 ? `
    <div style="background:#1a1f2b;border-radius:12px;overflow:hidden;border:1px solid #2a2f3a;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#252b38;">
            <th style="padding:10px 12px;text-align:left;color:#78909c;font-size:11px;font-weight:600;">SEVERITY</th>
            <th style="padding:10px 12px;text-align:left;color:#78909c;font-size:11px;font-weight:600;">CATEGORY</th>
            <th style="padding:10px 12px;text-align:left;color:#78909c;font-size:11px;font-weight:600;">OBJECT</th>
            <th style="padding:10px 12px;text-align:left;color:#78909c;font-size:11px;font-weight:600;">MESSAGE</th>
          </tr>
        </thead>
        <tbody>${findingsRows}</tbody>
      </table>
    </div>` : `
    <div style="background:#1a1f2b;border-radius:12px;padding:24px;text-align:center;border:1px solid #2a2f3a;color:#78909c;">
      No findings — all clear.
    </div>`}

    <!-- Footer -->
    <div style="margin-top:24px;text-align:center;color:#546e7a;font-size:11px;">
      Pipeline Auditor &bull; Powered by Cortex Code Agent SDK
    </div>
  </div>
</body>
</html>`;
}
function sendReportEmail(report, database, schema, durationMs, toolCalls) {
    try {
        const summary = report.summary || {};
        const health = String(summary.overall_health || "unknown").replace(/_/g, " ");
        const target = schema ? `${database}.${schema}` : database;
        const subject = `Pipeline Audit: ${target} — ${health}`;
        const html = buildReportHtml(report, database, schema, durationMs, toolCalls);
        // Escape single quotes for SQL string literal
        const escapedHtml = html.replace(/'/g, "''");
        const escapedSubject = subject.replace(/'/g, "''");
        snowSql(`CALL SYSTEM$SEND_EMAIL('${EMAIL_INTEGRATION}', '${EMAIL_RECIPIENT}', '${escapedSubject}', '${escapedHtml}', 'text/html')`);
        console.log(`[Email] Audit report sent to ${EMAIL_RECIPIENT}`);
    }
    catch (err) {
        console.error("[Email] Failed to send report email:", err);
        // Non-fatal — audit should still succeed
    }
}
async function runHeadlessAudit(database, scope, schema, scheduleId, sendEmail = true) {
    const connection = DEFAULT_CONNECTION;
    const toolCounter = { count: 0, start: Date.now() };
    const options = {
        connection,
        cwd: "/tmp",
        systemPrompt: buildSystemPrompt(database, scope, schema),
        model: "auto",
        maxTurns: 20,
        canUseTool: readOnlyGuard,
        hooks: {
            PostToolUse: [
                { matcher: ".*", hooks: [async () => { toolCounter.count++; return {}; }] },
            ],
        },
        outputFormat: {
            type: "json_schema",
            schema: AUDIT_REPORT_SCHEMA,
        },
        disallowedTools: ["Write", "Edit"],
        settingSources: [],
    };
    const session = await createSession(options);
    const scopeLabels = {
        tables_freshness: "tables & freshness",
        dynamic_tables: "dynamic tables",
        tasks: "tasks",
        views: "views",
        streams: "streams",
        pipes: "pipes",
        procedures: "stored procedures",
    };
    const activeScope = scope.length > 0 ? scope : Object.keys(PROMPT_SECTIONS);
    const scopeDesc = activeScope.map((s) => scopeLabels[s] || s).join(", ");
    const schemaClause = schema ? ` Only audit the ${database}.${schema} schema — do NOT run SHOW SCHEMAS or look at any other schema.` : "";
    const prompt = schema
        ? `Run a comprehensive pipeline audit on ${database}.${schema}. Scope: ${scopeDesc}.${schemaClause} Run the checks described in the system prompt for each scope area directly against ${database}.${schema} and return the full structured audit report.`
        : `Run a comprehensive pipeline audit on the ${database} database. Scope: ${scopeDesc}. Discover all in-scope objects, run the checks described in the system prompt for each scope area, and return the full structured audit report.`;
    await session.send(prompt);
    let report = null;
    for await (const event of session.stream()) {
        if (event.type === "assistant") {
            for (const block of event.content) {
                if (block.type === "text" && block.text.trim()) {
                    try {
                        const parsed = JSON.parse(block.text);
                        if (parsed.findings) {
                            report = parsed;
                        }
                    }
                    catch { /* not JSON */ }
                }
            }
            if (report)
                break;
        }
        else if (event.type === "result") {
            const resultEvent = event;
            if (!resultEvent.is_error && resultEvent.structured_output && !report) {
                report = resultEvent.structured_output;
            }
            break;
        }
    }
    const durationMs = Date.now() - toolCounter.start;
    // Write to AUDIT_RESULTS table
    if (report) {
        const findingsCount = Array.isArray(report.findings) ? report.findings.length : 0;
        const reportJson = JSON.stringify(report).replace(/'/g, "''");
        const scheduleRef = scheduleId ? `'${scheduleId}'` : "NULL";
        const schemaVal = schema ? `'${schema}'` : "''";
        try {
            snowSql(`INSERT INTO AUTOMATED_INTELLIGENCE.AUDITOR.AUDIT_RESULTS (database, schema, report, duration_ms, tool_calls, findings_count, schedule_id) SELECT '${database}', ${schemaVal}, PARSE_JSON('${reportJson}'), ${durationMs}, ${toolCounter.count}, ${findingsCount}, ${scheduleRef}`, connection);
        }
        catch (err) {
            console.error("Failed to save audit result:", err);
        }
    }
    // Send email report if requested
    if (sendEmail && report) {
        sendReportEmail(report, database, schema, durationMs, toolCounter.count);
    }
    await session.close().catch(() => { });
    return { success: !!report, report, durationMs, toolCalls: toolCounter.count };
}
// ---------------------------------------------------------------------------
// POST /api/audit/headless — run audit synchronously, return JSON report
// ---------------------------------------------------------------------------
app.post("/api/audit/headless", async (req, res) => {
    const { database = "AUTOMATED_INTELLIGENCE", scope = [], schema = "", schedule_id = null, } = req.body || {};
    try {
        const result = await runHeadlessAudit(database, scope, schema, schedule_id);
        res.json(result);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("Headless audit error:", msg);
        res.status(500).json({ error: msg });
    }
});
// ---------------------------------------------------------------------------
// Schedule CRUD — backed by AUTOMATED_INTELLIGENCE.AUDITOR.AUDIT_SCHEDULES
// ---------------------------------------------------------------------------
const SCHEDULES_TABLE = "AUTOMATED_INTELLIGENCE.AUDITOR.AUDIT_SCHEDULES";
app.get("/api/schedules", (_req, res) => {
    try {
        const rows = snowSql(`SELECT * FROM ${SCHEDULES_TABLE} ORDER BY created_at DESC`);
        res.json({ schedules: rows });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to list schedules", detail: String(err) });
    }
});
app.post("/api/schedules", (req, res) => {
    const { database, scope, schema, interval_minutes, cron_label, send_email } = req.body || {};
    if (!database || !interval_minutes) {
        return res.status(400).json({ error: "database and interval_minutes are required" });
    }
    const scopeArr = JSON.stringify(scope || []).replace(/'/g, "''");
    const schemaVal = schema || "";
    const sendEmailVal = send_email !== false; // default true
    const nextRun = `DATEADD(minute, ${interval_minutes}, CURRENT_TIMESTAMP())`;
    try {
        snowSql(`INSERT INTO ${SCHEDULES_TABLE} (database, connection, scope, schema, interval_minutes, cron_label, next_run, send_email) SELECT '${database}', '${DEFAULT_CONNECTION}', PARSE_JSON('${scopeArr}'), '${schemaVal}', ${interval_minutes}, '${cron_label || "Custom"}', ${nextRun}, ${sendEmailVal}`);
        const rows = snowSql(`SELECT * FROM ${SCHEDULES_TABLE} ORDER BY created_at DESC LIMIT 1`);
        res.json({ schedule: rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to create schedule", detail: String(err) });
    }
});
app.delete("/api/schedules/:id", (req, res) => {
    const { id } = req.params;
    try {
        snowSql(`DELETE FROM ${SCHEDULES_TABLE} WHERE id = '${id}'`);
        res.json({ deleted: true });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to delete schedule", detail: String(err) });
    }
});
app.patch("/api/schedules/:id", (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled (boolean) is required" });
    }
    try {
        snowSql(`UPDATE ${SCHEDULES_TABLE} SET enabled = ${enabled} WHERE id = '${id}'`);
        const rows = snowSql(`SELECT * FROM ${SCHEDULES_TABLE} WHERE id = '${id}'`);
        res.json({ schedule: rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to update schedule", detail: String(err) });
    }
});
// ---------------------------------------------------------------------------
// GET /api/audit/history — past audit results
// ---------------------------------------------------------------------------
app.get("/api/audit/history", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    try {
        const rows = snowSql(`SELECT id, schedule_id, database, schema, duration_ms, tool_calls, findings_count, created_at FROM AUTOMATED_INTELLIGENCE.AUDITOR.AUDIT_RESULTS ORDER BY created_at DESC LIMIT ${limit}`);
        res.json({ results: rows });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch audit history", detail: String(err) });
    }
});
// ---------------------------------------------------------------------------
// POST /api/audit/email — send an audit report via email (on demand)
// ---------------------------------------------------------------------------
app.post("/api/audit/email", (req, res) => {
    const { report, database, schema, durationMs, toolCalls } = req.body || {};
    if (!report || !database) {
        return res.status(400).json({ error: "report and database are required" });
    }
    try {
        sendReportEmail(report, database, schema || "", durationMs || 0, toolCalls || 0);
        res.json({ sent: true });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to send email", detail: String(err) });
    }
});
app.get("/api/audit/history/:id", (req, res) => {
    const { id } = req.params;
    try {
        const rows = snowSql(`SELECT * FROM AUTOMATED_INTELLIGENCE.AUDITOR.AUDIT_RESULTS WHERE id = '${id}'`);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Audit result not found" });
        }
        res.json({ result: rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to fetch audit result", detail: String(err) });
    }
});
// ---------------------------------------------------------------------------
// SPA fallback — serve index.html for non-API routes in production
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
    app.get("*", (_req, res) => {
        res.sendFile(path.join(distDir, "index.html"));
    });
}
// ---------------------------------------------------------------------------
// In-container scheduler — checks AUDIT_SCHEDULES every 5 min and runs due audits
// Replaces the Snowflake Task + stored procedure approach (avoids proxy timeout)
// ---------------------------------------------------------------------------
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let schedulerRunning = false;
async function checkSchedules() {
    if (schedulerRunning) {
        console.log("[Scheduler] Previous run still active, skipping");
        return;
    }
    schedulerRunning = true;
    console.log("[Scheduler] Checking for due audits...");
    try {
        const dueRows = snowSql(`SELECT id, database, scope, schema, send_email FROM ${SCHEDULES_TABLE} WHERE enabled = TRUE AND next_run <= CURRENT_TIMESTAMP()`);
        if (dueRows.length === 0) {
            console.log("[Scheduler] No due audits found");
            schedulerRunning = false;
            return;
        }
        console.log(`[Scheduler] Found ${dueRows.length} due audit(s)`);
        for (const row of dueRows) {
            // Snowflake returns uppercase keys via snow_sql.py
            const scheduleId = String(row.ID ?? row.id ?? "");
            const database = String(row.DATABASE ?? row.database ?? "");
            const schema = String(row.SCHEMA ?? row.schema ?? "");
            const sendEmail = Boolean(row.SEND_EMAIL ?? row.send_email ?? true);
            const rawScope = row.SCOPE ?? row.scope;
            let scope = [];
            try {
                if (typeof rawScope === "string")
                    scope = JSON.parse(rawScope);
                else if (Array.isArray(rawScope))
                    scope = rawScope;
                if (!Array.isArray(scope))
                    scope = [];
            }
            catch {
                scope = [];
            }
            // Mark as running + bump next_run immediately (prevents re-triggering)
            try {
                snowSql(`UPDATE ${SCHEDULES_TABLE} SET last_run = CURRENT_TIMESTAMP(), last_status = 'running', next_run = DATEADD('minute', interval_minutes, CURRENT_TIMESTAMP()) WHERE id = '${scheduleId}'`);
            }
            catch (err) {
                console.error(`[Scheduler] Failed to update schedule ${scheduleId}:`, err);
                continue;
            }
            console.log(`[Scheduler] Running audit for schedule ${scheduleId}: ${database}${schema ? `.${schema}` : ""}`);
            try {
                const result = await runHeadlessAudit(database, scope, schema, scheduleId, sendEmail);
                const status = result.success ? "success" : "failed";
                snowSql(`UPDATE ${SCHEDULES_TABLE} SET last_status = '${status}' WHERE id = '${scheduleId}'`);
                console.log(`[Scheduler] Audit ${scheduleId} completed: ${status} (${result.durationMs}ms, ${result.toolCalls} tools)`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : "Unknown error";
                console.error(`[Scheduler] Audit ${scheduleId} failed:`, msg);
                try {
                    snowSql(`UPDATE ${SCHEDULES_TABLE} SET last_status = 'error' WHERE id = '${scheduleId}'`);
                }
                catch { /* ignore */ }
            }
        }
    }
    catch (err) {
        console.error("[Scheduler] Error checking schedules:", err);
    }
    finally {
        schedulerRunning = false;
    }
}
// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\nPipeline Auditor backend running on http://localhost:${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || "development"}`);
    console.log(`Endpoints:`);
    console.log(`  POST /api/audit              — Start audit (returns jobId)`);
    console.log(`  GET  /api/audit/progress/:id — Poll audit/chat events`);
    console.log(`  POST /api/audit/headless     — Run audit synchronously`);
    console.log(`  POST /api/audit/email        — Email a report on demand`);
    console.log(`  GET  /api/audit/history      — Past audit results`);
    console.log(`  GET  /api/schedules          — List schedules`);
    console.log(`  POST /api/schedules          — Create schedule`);
    console.log(`  POST /api/chat               — Send follow-up (returns jobId)`);
    console.log(`  GET  /api/health             — Health check`);
    console.log(`\nScheduler: checking AUDIT_SCHEDULES every ${SCHEDULER_INTERVAL_MS / 1000}s\n`);
    // Start the in-container scheduler
    setInterval(checkSchedules, SCHEDULER_INTERVAL_MS);
    // Also run once on startup (after a short delay to let things settle)
    setTimeout(checkSchedules, 60_000);
});
process.on("SIGTERM", async () => {
    if (activeSession)
        await activeSession.close();
    process.exit(0);
});
process.on("SIGINT", async () => {
    if (activeSession)
        await activeSession.close();
    process.exit(0);
});
