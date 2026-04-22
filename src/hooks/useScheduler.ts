import { useState, useEffect, useCallback, useRef } from "react";

export interface AuditSchedule {
  id: string;
  database: string;
  connection: string;
  scope: string[];
  schema: string;
  cronLabel: string;
  intervalMs: number;
  nextRun: number;
  enabled: boolean;
  createdAt: number;
}

export const SCHEDULE_PRESETS = [
  { label: "Every 6 hours", intervalMs: 6 * 60 * 60 * 1000 },
  { label: "Daily at next interval", intervalMs: 24 * 60 * 60 * 1000 },
  { label: "Every 12 hours", intervalMs: 12 * 60 * 60 * 1000 },
  { label: "Weekly", intervalMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

const STORAGE_KEY = "pipeline-auditor-schedules";
const CHECK_INTERVAL_MS = 60_000;

function loadSchedules(): AuditSchedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AuditSchedule[];
  } catch {
    return [];
  }
}

function persistSchedules(schedules: AuditSchedule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

export function useScheduler(onTrigger: (schedule: AuditSchedule) => void) {
  const [schedules, setSchedules] = useState<AuditSchedule[]>(loadSchedules);
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  // Persist to localStorage on every change
  useEffect(() => {
    persistSchedules(schedules);
  }, [schedules]);

  // Poll every 60s and fire any due schedules
  useEffect(() => {
    const intervalId = setInterval(() => {
      const now = Date.now();
      setSchedules((prev) => {
        let changed = false;
        const next = prev.map((s) => {
          if (s.enabled && s.nextRun <= now) {
            changed = true;
            onTriggerRef.current(s);
            return { ...s, nextRun: now + s.intervalMs };
          }
          return s;
        });
        return changed ? next : prev;
      });
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  const addSchedule = useCallback(
    (input: Omit<AuditSchedule, "id" | "nextRun" | "createdAt">) => {
      const now = Date.now();
      const schedule: AuditSchedule = {
        ...input,
        id: crypto.randomUUID(),
        nextRun: now + input.intervalMs,
        createdAt: now,
      };
      setSchedules((prev) => [...prev, schedule]);
    },
    [],
  );

  const removeSchedule = useCallback((id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleSchedule = useCallback((id: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }, []);

  const clearSchedules = useCallback(() => {
    setSchedules([]);
  }, []);

  return {
    schedules,
    addSchedule,
    removeSchedule,
    toggleSchedule,
    clearSchedules,
  } as const;
}
