import { useState, useEffect, useCallback } from "react";

export interface AuditResult {
  id: string;
  scheduleId: string | null;
  database: string;
  schema: string;
  durationMs: number;
  toolCalls: number;
  findingsCount: number;
  createdAt: string;
}

function rowToResult(row: Record<string, unknown>): AuditResult {
  return {
    id: String(row.id ?? row.ID ?? ""),
    scheduleId: row.schedule_id ?? row.SCHEDULE_ID ? String(row.schedule_id ?? row.SCHEDULE_ID) : null,
    database: String(row.database ?? row.DATABASE ?? ""),
    schema: String(row.schema ?? row.SCHEMA ?? ""),
    durationMs: Number(row.duration_ms ?? row.DURATION_MS ?? 0),
    toolCalls: Number(row.tool_calls ?? row.TOOL_CALLS ?? 0),
    findingsCount: Number(row.findings_count ?? row.FINDINGS_COUNT ?? 0),
    createdAt: String(row.created_at ?? row.CREATED_AT ?? ""),
  };
}

export function useAuditHistory() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit/history`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped = (data.results as Record<string, unknown>[]).map(rowToResult);
      setResults(mapped);
    } catch (err) {
      console.error("Failed to fetch audit history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const id = setInterval(fetchHistory, 60_000);
    return () => clearInterval(id);
  }, [fetchHistory]);

  const removeResult = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/audit/history/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResults((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete audit result:", err);
    }
  }, []);

  return { results, loading, refresh: fetchHistory, removeResult } as const;
}
