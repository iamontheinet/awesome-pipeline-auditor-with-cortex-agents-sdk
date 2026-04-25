import { useState, useEffect, useCallback } from "react";

export interface AuditSchedule {
  id: string;
  database: string;
  scope: string[];
  schema: string;
  cronLabel: string;
  intervalMinutes: number;
  nextRun: string;
  lastRun: string | null;
  lastStatus: string | null;
  enabled: boolean;
  createdAt: string;
}

export const SCHEDULE_PRESETS = [
  { label: "Every 6 hours", intervalMinutes: 360 },
  { label: "Every 12 hours", intervalMinutes: 720 },
  { label: "Every 24 hours", intervalMinutes: 1440 },
  { label: "Every 7 days", intervalMinutes: 10080 },
] as const;

// Map Snowflake row (uppercase keys) to our camelCase interface
function rowToSchedule(row: Record<string, unknown>): AuditSchedule {
  return {
    id: String(row.ID ?? row.id ?? ""),
    database: String(row.DATABASE ?? row.database ?? ""),
    scope: Array.isArray(row.SCOPE) ? row.SCOPE : Array.isArray(row.scope) ? row.scope : [],
    schema: String(row.SCHEMA ?? row.schema ?? ""),
    cronLabel: String(row.CRON_LABEL ?? row.cron_label ?? "Custom"),
    intervalMinutes: Number(row.INTERVAL_MINUTES ?? row.interval_minutes ?? 1440),
    nextRun: String(row.NEXT_RUN ?? row.next_run ?? ""),
    lastRun: row.LAST_RUN ?? row.last_run ? String(row.LAST_RUN ?? row.last_run) : null,
    lastStatus: row.LAST_STATUS ?? row.last_status ? String(row.LAST_STATUS ?? row.last_status) : null,
    enabled: Boolean(row.ENABLED ?? row.enabled ?? true),
    createdAt: String(row.CREATED_AT ?? row.created_at ?? ""),
  };
}

const API_BASE = "/api";

export function useScheduler(_onTrigger?: (schedule: AuditSchedule) => void) {
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch schedules from server
  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/schedules`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped = (data.schedules as Record<string, unknown>[]).map(rowToSchedule);
      setSchedules(mapped);
    } catch (err) {
      console.error("Failed to fetch schedules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + poll every 60s
  useEffect(() => {
    fetchSchedules();
    const id = setInterval(fetchSchedules, 60_000);
    return () => clearInterval(id);
  }, [fetchSchedules]);

  const addSchedule = useCallback(
    async (input: {
      database: string;
      scope: string[];
      schema: string;
      cronLabel: string;
      intervalMinutes: number;
      enabled: boolean;
      sendEmail?: boolean;
    }) => {
      try {
        const res = await fetch(`${API_BASE}/schedules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            database: input.database,
            scope: input.scope,
            schema: input.schema,
            interval_minutes: input.intervalMinutes,
            cron_label: input.cronLabel,
            send_email: input.sendEmail ?? true,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchSchedules();
      } catch (err) {
        console.error("Failed to create schedule:", err);
      }
    },
    [fetchSchedules],
  );

  const removeSchedule = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API_BASE}/schedules/${id}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSchedules((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        console.error("Failed to delete schedule:", err);
      }
    },
    [],
  );

  const toggleSchedule = useCallback(
    async (id: string) => {
      const current = schedules.find((s) => s.id === id);
      if (!current) return;
      try {
        const res = await fetch(`${API_BASE}/schedules/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ enabled: !current.enabled }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchSchedules();
      } catch (err) {
        console.error("Failed to toggle schedule:", err);
      }
    },
    [schedules, fetchSchedules],
  );

  const clearSchedules = useCallback(async () => {
    try {
      await Promise.all(
        schedules.map((s) =>
          fetch(`${API_BASE}/schedules/${s.id}`, { method: "DELETE", credentials: "include" }),
        ),
      );
      setSchedules([]);
    } catch (err) {
      console.error("Failed to clear schedules:", err);
    }
  }, [schedules]);

  return {
    schedules,
    loading,
    addSchedule,
    removeSchedule,
    toggleSchedule,
    clearSchedules,
    refresh: fetchSchedules,
  } as const;
}
