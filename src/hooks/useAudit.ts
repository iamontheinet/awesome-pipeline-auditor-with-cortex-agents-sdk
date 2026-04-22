import { useState, useCallback, useRef } from "react";
import type {
  AuditReport,
  ChatMessage,
  StreamEvent,
  ToolProgressEvent,
} from "../types";

interface AuditState {
  isAuditing: boolean;
  isLoading: boolean;
  report: AuditReport | null;
  messages: ChatMessage[];
  toolProgress: ToolProgressEvent[];
  error: string | null;
  stats: {
    durationMs: number;
    numTurns: number;
    toolCalls: number;
  } | null;
}

export function useAudit() {
  const [state, setState] = useState<AuditState>({
    isAuditing: false,
    isLoading: false,
    report: null,
    messages: [],
    toolProgress: [],
    error: null,
    stats: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  // Parse NDJSON stream from response
  const parseNdjsonStream = useCallback(
    async (
      response: Response,
      onEvent: (event: StreamEvent) => void
    ) => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as StreamEvent;
              onEvent(event);
            } catch {
              // skip malformed lines
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim()) as StreamEvent;
            onEvent(event);
          } catch {
            // skip
          }
        }
      } finally {
        // Ensure the reader is released on abort or completion
        reader.releaseLock();
      }
    },
    []
  );

  // Start a new audit
  const startAudit = useCallback(
    async (database: string, connection: string, scope: string[] = [], schema: string = "") => {
      // Abort any existing request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantMsgId = `audit-${Date.now()}`;
      let assistantText = "";
      const thinkingSteps: string[] = [];
      const toolCalls: ToolProgressEvent[] = [];

      setState({
        isAuditing: true,
        isLoading: true,
        report: null,
        messages: [
          {
            id: `user-${Date.now()}`,
            role: "user",
            text: schema
              ? `Audit ${database} database, schema ${schema}`
              : `Audit ${database} database`,
            timestamp: new Date(),
          },
          {
            id: assistantMsgId,
            role: "assistant",
            text: "",
            timestamp: new Date(),
            isStreaming: true,
            thinkingSteps: [],
            toolCalls: [],
          },
        ],
        toolProgress: [],
        error: null,
        stats: null,
      });

      try {
        const response = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ database, connection, scope, schema }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        await parseNdjsonStream(response, (event) => {
          // Ignore events after abort (buffered data may still arrive)
          if (controller.signal.aborted) return;

          switch (event.type) {
            case "status":
              // Don't display status messages in chat — audit progress accordion handles this
              break;

            case "tool_progress":
              toolCalls.push(event);
              setState((prev) => ({
                ...prev,
                toolProgress: [...toolCalls],
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: toolCalls.map((tc) => ({
                          toolName: tc.toolName,
                          elapsed: tc.elapsed,
                          sqlPreview: tc.sqlPreview,
                          description: tc.description,
                        })),
                      }
                    : m
                ),
              }));
              break;

            case "thinking":
              thinkingSteps.push(event.text);
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, thinkingSteps: [...thinkingSteps] }
                    : m
                ),
              }));
              break;

            case "text":
              assistantText += event.text;
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: assistantText }
                    : m
                ),
              }));
              break;

            case "report":
              // Don't set assistant text — the report accordion is the canonical display
              setState((prev) => ({
                ...prev,
                report: event.report,
              }));
              break;

            case "result":
              if (event.report) {
                setState((prev) => ({
                  ...prev,
                  report: prev.report || event.report || null,
                }));
              }
              setState((prev) => ({
                ...prev,
                isLoading: false,
                stats: {
                  durationMs: event.durationMs,
                  numTurns: event.numTurns,
                  toolCalls: event.toolCalls || toolCalls.length,
                },
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, isStreaming: false }
                    : m
                ),
              }));
              break;

            case "error":
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: event.message,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        isStreaming: false,
                        text: `Error: ${event.message}`,
                      }
                    : m
                ),
              }));
              break;
          }
        });

        // Final state update if stream ended without a result event
        // BUT skip this if we were aborted — cancelAudit already reset state
        if (!controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            messages: prev.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            ),
          }));
        }
      } catch (err) {
        // If the controller was aborted (by cancelAudit), bail out regardless of error type.
        // The abort can surface as AbortError, TypeError, or the stream may just end —
        // cancelAudit already handled state cleanup.
        if (controller.signal.aborted) {
          return;
        }
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isAuditing: false,
          error: msg,
        }));
      }
    },
    [parseNdjsonStream]
  );

  // Send a follow-up chat message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || state.isLoading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: text.trim(),
        timestamp: new Date(),
      };

      const assistantMsgId = `chat-${Date.now()}`;
      let assistantText = "";
      const thinkingSteps: string[] = [];

      setState((prev) => ({
        ...prev,
        isLoading: true,
        messages: [
          ...prev.messages,
          userMsg,
          {
            id: assistantMsgId,
            role: "assistant",
            text: "",
            timestamp: new Date(),
            isStreaming: true,
            thinkingSteps: [],
            toolCalls: [],
          },
        ],
      }));

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim() }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            (errorData as Record<string, string>).error ||
              `Server error: ${response.status}`
          );
        }

        await parseNdjsonStream(response, (event) => {
          switch (event.type) {
            case "text":
              assistantText += event.text;
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: assistantText }
                    : m
                ),
              }));
              break;

            case "thinking":
              thinkingSteps.push(event.text);
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, thinkingSteps: [...thinkingSteps] }
                    : m
                ),
              }));
              break;

            case "tool_use":
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls || []),
                          { toolName: event.toolName },
                        ],
                      }
                    : m
                ),
              }));
              break;

            case "result":
              setState((prev) => ({
                ...prev,
                isLoading: false,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, isStreaming: false }
                    : m
                ),
              }));
              break;

            case "error":
              setState((prev) => ({
                ...prev,
                isLoading: false,
                messages: prev.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        isStreaming: false,
                        text: `Error: ${event.message}`,
                      }
                    : m
                ),
              }));
              break;
          }
        });

        setState((prev) => ({
          ...prev,
          isLoading: false,
          messages: prev.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m
          ),
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          messages: prev.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, isStreaming: false, text: `Error: ${msg}` }
              : m
          ),
        }));
      }
    },
    [state.isLoading, parseNdjsonStream]
  );

  const cancelAudit = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      // Full reset — return to landing page
      setState({
        isAuditing: false,
        isLoading: false,
        report: null,
        messages: [],
        toolProgress: [],
        error: null,
        stats: null,
      });
    }
  }, []);

  return {
    ...state,
    startAudit,
    sendMessage,
    cancelAudit,
  };
}
