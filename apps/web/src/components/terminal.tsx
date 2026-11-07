import type { DeploymentLog } from "@nocap/shared";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { refreshApps } from "../queries";
import { SpinnerIcon } from "./icons";
import { cn } from "./ui";

/** A dark, monospaced log box that keeps the newest line in view unless the user scrolls up. */
export function Terminal({
  text,
  live = false,
  empty = "No output yet.",
  className,
}: {
  text: string;
  live?: boolean;
  empty?: string;
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const box = ref.current;
    if (box && stick.current) box.scrollTop = box.scrollHeight;
  }, [text]);

  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();

  return (
    <pre
      ref={ref}
      onScroll={(event) => {
        const box = event.currentTarget;
        stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      }}
      className={cn(
        "max-h-[28rem] min-h-40 overflow-auto rounded-lg border border-white/10 bg-terminal p-4 font-mono text-xs leading-relaxed text-neutral-300",
        className,
      )}
      tabIndex={0}
      aria-label="Log output"
    >
      {lines.length === 0 ? <span className="text-neutral-500">{empty}</span> : null}
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "break-all whitespace-pre-wrap",
            line.startsWith("==>") && "mt-2 font-semibold text-white",
            line.startsWith("==> Failed") && "text-red-400",
            line.startsWith("==> Done") && "text-sky-300",
          )}
        >
          {line || " "}
        </div>
      ))}
      {live ? (
        <div className="mt-2 flex items-center gap-2 text-neutral-500">
          <SpinnerIcon className="size-3" />
          Working
        </div>
      ) : null}
    </pre>
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
      <Terminal text={text} live={!done} empty="Waiting for the build to start…" />
    </div>
  );
}
