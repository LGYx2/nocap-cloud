import type { DeploymentLog } from "@nocap/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { highlightLine, type LineKind, type TokenKind } from "../lib/highlight";
import { refreshApps } from "../queries";
import { CheckIcon } from "./icons";
import { cn } from "./ui";

const TOKEN_CLASS: Record<TokenKind, string> = {
  dim: "text-term-dim",
  link: "text-term-info underline decoration-term-info/40 underline-offset-2",
  accent: "text-term-accent",
  info: "text-term-info",
  ok: "text-term-info",
  warn: "text-term-warn",
  error: "text-term-error font-medium",
  string: "text-term-string",
};

// Error and warning lines also get a tinted band, set in styles.css by data-kind.
const LINE_CLASS: Record<LineKind, string> = {
  plain: "",
  step: "mt-3 font-semibold text-term-bright",
  "step-done": "mt-3 font-semibold text-term-info",
  "step-failed": "mt-3 font-semibold text-term-error",
  error: "",
  warn: "",
};

function CopyLog({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      disabled={!text}
      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-term-dim transition-colors hover:bg-white/10 hover:text-term-bright disabled:opacity-40"
    >
      {copied ? <CheckIcon className="size-3" /> : null}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * A dark log box with colored timestamps, levels, steps, HTTP codes and URLs. It keeps the
 * newest line in view unless the user scrolls up. Line numbers come from CSS, so copied text
 * stays clean.
 */
export function Terminal({
  text,
  live = false,
  empty = "No output yet.",
  title = "Output",
  className,
}: {
  text: string;
  live?: boolean;
  empty?: string;
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const box = ref.current;
    if (box && stick.current) box.scrollTop = box.scrollHeight;
  }, [text]);

  const lines = useMemo(() => {
    const raw = text.split("\n");
    if (raw.at(-1) === "") raw.pop();
    return raw.map(highlightLine);
  }, [text]);

  const problems = lines.filter((l) => l.kind === "error" || l.kind === "step-failed").length;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-terminal font-mono text-xs text-term-fg shadow-sm">
      <div className="flex items-center gap-3 border-b border-white/[0.08] bg-terminal-bar px-3 py-1.5">
        <span className="inline-flex items-center gap-2 text-term-dim">
          {live ? (
            <span className="relative inline-flex size-2" aria-hidden="true">
              <span className="status-pulse absolute inset-0 rounded-full bg-term-accent" />
              <span className="relative size-2 rounded-full bg-term-accent" />
            </span>
          ) : (
            <span className="size-2 rounded-full bg-white/20" aria-hidden="true" />
          )}
          {title}
          {live ? <span className="text-term-accent">live</span> : null}
        </span>
        <span className="ml-auto text-term-dim tabular-nums">
          {problems > 0 ? (
            <span className="mr-3 text-term-error">
              {problems} {problems === 1 ? "error" : "errors"}
            </span>
          ) : null}
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
        <CopyLog text={text} />
      </div>
      <div
        ref={ref}
        onScroll={(event) => {
          const box = event.currentTarget;
          stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        }}
        className={cn("max-h-[28rem] min-h-40 overflow-auto py-3 leading-relaxed", className)}
        tabIndex={0}
        role="log"
        aria-label={`${title} log`}
        aria-live={live ? "polite" : "off"}
      >
        {lines.length === 0 ? (
          <p className="px-4 text-term-dim">{empty}</p>
        ) : (
          <div className="term-lines">
            {lines.map((line, index) => {
              // Step headers keep one color; only their ==> marker stands out.
              const step = line.kind.startsWith("step");
              return (
                <div
                  key={index}
                  data-kind={line.kind}
                  className={cn("term-line flex pr-4 whitespace-pre-wrap", LINE_CLASS[line.kind])}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {line.tokens.length === 0
                      ? " "
                      : line.tokens.map((token, i) =>
                          token.kind && (!step || token.text === "==>") ? (
                            <span
                              key={i}
                              className={step ? "text-term-accent" : TOKEN_CLASS[token.kind]}
                            >
                              {token.text}
                            </span>
                          ) : (
                            token.text
                          ),
                        )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {live ? (
          <div className="flex pl-12" aria-hidden="true">
            <span className="term-caret inline-block h-3.5 w-1.5 translate-y-0.5 bg-term-dim" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Follows a deployment's build log, asking only for new lines every second until it ends. */
export function DeploymentLogView({
  deploymentId,
  applicationId,
}: {
  deploymentId: string;
  applicationId: string;
}) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let offset = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setText("");
    setDone(false);
    setError(null);

    async function poll() {
      try {
        const chunk = await api<DeploymentLog>(
          `/api/deployments/${deploymentId}/logs?offset=${offset}`,
        );
        if (stopped) return;
        offset = chunk.next;
        if (chunk.text) setText((current) => current + chunk.text);
        if (chunk.done) {
          setDone(true);
          void refreshApps(applicationId);
          return;
        }
      } catch (err) {
        if (!stopped) setError(err instanceof Error ? err.message : "Could not load the log");
      }
      if (!stopped) timer = setTimeout(() => void poll(), 1000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [deploymentId, applicationId]);

  return (
    <div>
      {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
      <Terminal
        text={text}
        live={!done}
        title="Build log"
        empty="Waiting for the build to start…"
      />
    </div>
  );
}
