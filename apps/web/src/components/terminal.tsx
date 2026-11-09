import type { DeploymentLog } from "@nocap/shared";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Token, TokenKind } from "../lib/highlight";
import { type LogLine, parseLog, type Section } from "../lib/log-sections";
import { refreshApps } from "../queries";
import { CheckIcon, ChevronRightIcon, DownloadIcon, SearchIcon, SpinnerIcon, XIcon } from "./icons";
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

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Token text with the search matches marked. */
function marked(text: string, query: RegExp | null): ReactNode {
  if (!query) return text;
  const parts = text.split(query);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-[3px] bg-term-warn/30 text-term-bright">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function Row({ line, query }: { line: LogLine; query: RegExp | null }) {
  return (
    <div data-line={line.n} data-kind={line.kind} className="term-row">
      <span className="term-n" data-n={line.n} aria-hidden="true" />
      <span className="min-w-0 flex-1 pr-4 break-words whitespace-pre-wrap">
        {line.tokens.length === 0
          ? " "
          : line.tokens.map((token: Token, i) => (
              <span key={i} className={token.kind ? TOKEN_CLASS[token.kind] : undefined}>
                {marked(token.text, query)}
              </span>
            ))}
      </span>
    </div>
  );
}

function StatusMark({ status }: { status: Section["status"] }) {
  if (status === "running") return <SpinnerIcon className="size-3.5 text-term-accent" />;
  if (status === "failed") return <XIcon className="size-3.5 text-term-error" />;
  return <CheckIcon className="size-3.5 text-term-info" />;
}

function HeaderButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-term-dim transition-colors hover:bg-white/10 hover:text-term-bright disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * A dark log viewer. Build logs fold into steps with a status each, and a failed build opens
 * on the error. Search filters the lines, line numbers never end up in copied text, and the
 * view follows new lines unless the reader scrolls up.
 */
export function Terminal({
  text,
  live = false,
  empty = "No output yet.",
  title = "Output",
  scrollTo = "bottom",
  className,
}: {
  text: string;
  live?: boolean;
  empty?: string;
  title?: string;
  /** Where a finished log opens: at the end, or on its first error. */
  scrollTo?: "bottom" | "first-error";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const opened = useRef(false);
  const wasLive = useRef(live);
  const [search, setSearch] = useState("");
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  const log = useMemo(() => parseLog(text, live), [text, live]);
  const query = useMemo(
    () => (search.trim() ? new RegExp(`(${escape(search.trim())})`, "gi") : null),
    [search],
  );
  // Once a build failed, the steps that passed fold away so the error is what you see.
  const failedBuild = !live && log.result?.kind === "failed";
  const isOpen = (section: Section, index: number) =>
    section.title === null || (toggled[index] ?? !(failedBuild && section.status === "done"));

  function scrollToLine(n: number) {
    const index = log.sections.findIndex((s) => s.lines.some((l) => l.n === n));
    if (index >= 0) setToggled((t) => ({ ...t, [index]: true }));
    requestAnimationFrame(() => {
      const container = box.current;
      const row = container?.querySelector<HTMLElement>(`[data-line="${n}"]`);
      if (!container || !row) return;
      stick.current = false;
      container.scrollTop = row.offsetTop - container.clientHeight / 2;
    });
  }

  useEffect(() => {
    const container = box.current;
    if (!container || log.count === 0) return;
    const first = !opened.current;
    opened.current = true;
    const justFinished = wasLive.current && !live;
    wasLive.current = live;
    const firstError = log.errors.find((n) => n !== log.result?.n);
    if ((first || justFinished) && !live && scrollTo === "first-error" && firstError) {
      scrollToLine(firstError);
      return;
    }
    if (first || stick.current) container.scrollTop = container.scrollHeight;
  }, [log, live, scrollTo]);

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return null;
    return log.sections
      .flatMap((s) => s.lines)
      .filter((l) => l.text.toLowerCase().includes(needle));
  }, [log, search]);

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^\w.-]+/g, "-").toLowerCase()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-terminal font-mono text-[12.5px] text-term-fg shadow-sm">
      <div className="flex items-center gap-2 border-b border-white/[0.08] bg-terminal-bar py-1 pr-1.5 pl-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-term-dim">
          {live ? (
            <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
              <span className="status-pulse absolute inset-0 rounded-full bg-term-accent" />
              <span className="relative size-2 rounded-full bg-term-accent" />
            </span>
          ) : (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                failedBuild
                  ? "bg-term-error"
                  : log.result?.kind === "done"
                    ? "bg-term-info"
                    : "bg-white/25",
              )}
              aria-hidden="true"
            />
          )}
          <span className="truncate">{title}</span>
        </span>

        <label className="ml-auto flex h-7 items-center gap-1.5 rounded-md bg-white/[0.06] px-2 text-term-dim focus-within:bg-white/10 focus-within:text-term-fg">
          <SearchIcon className="size-3.5 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search the log"
            className="w-20 bg-transparent text-term-fg outline-none placeholder:text-term-dim focus-visible:outline-none sm:w-36"
            spellCheck={false}
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="hover:text-term-bright"
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </label>

        {log.errors.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              const target = log.errors.find((n) => n !== log.result?.n) ?? log.errors[0];
              if (target) scrollToLine(target);
            }}
            title="Go to the first error"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-term-error/15 px-2 whitespace-nowrap text-term-error transition-colors hover:bg-term-error/25"
          >
            {log.errors.length} {log.errors.length === 1 ? "error" : "errors"}
          </button>
        ) : null}
        <span className="hidden px-1 text-term-dim tabular-nums sm:inline">
          {matches ? `${matches.length} of ${log.count}` : `${log.count} lines`}
        </span>
        <HeaderButton
          label="Copy the log"
          disabled={!text}
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <CheckIcon className="size-3.5" /> : null}
          {copied ? "Copied" : "Copy"}
        </HeaderButton>
        <HeaderButton label="Download the log" disabled={!text} onClick={download}>
          <DownloadIcon className="size-3.5" />
        </HeaderButton>
      </div>

      <div
        ref={box}
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className={cn(
          "term-scroll relative max-h-[28rem] min-h-40 overflow-auto py-2 leading-[1.7]",
          className,
        )}
        tabIndex={0}
        role="log"
        aria-label={`${title} log`}
        aria-live={live ? "polite" : "off"}
      >
        {log.count === 0 ? (
          <p className="px-4 py-1 text-term-dim">{empty}</p>
        ) : matches ? (
          matches.length === 0 ? (
            <p className="px-4 py-1 text-term-dim">No lines match “{search.trim()}”.</p>
          ) : (
            matches.map((line) => <Row key={line.n} line={line} query={query} />)
          )
        ) : (
          log.sections.map((section, index) => {
            const open = isOpen(section, index);
            const noLines = section.lines.length === 0;
            return (
              <div key={index}>
                {section.title !== null ? (
                  <button
                    type="button"
                    onClick={() => setToggled((t) => ({ ...t, [index]: !open }))}
                    aria-expanded={noLines ? undefined : open}
                    disabled={noLines}
                    className={cn(
                      "flex w-full items-center gap-2 py-1 pr-4 text-left transition-colors enabled:hover:bg-white/[0.04]",
                      index > 0 && "border-t border-white/[0.06]",
                    )}
                  >
                    <span className="flex w-12 shrink-0 justify-end pr-2">
                      {noLines ? null : (
                        <ChevronRightIcon
                          className={cn(
                            "size-3.5 text-term-dim transition-transform",
                            open && "rotate-90",
                          )}
                        />
                      )}
                    </span>
                    <StatusMark status={section.status} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-semibold",
                        section.status === "failed" ? "text-term-error" : "text-term-bright",
                      )}
                    >
                      {section.title}
                    </span>
                    {noLines ? null : (
                      <span className="shrink-0 text-term-dim tabular-nums">
                        {section.lines.length} {section.lines.length === 1 ? "line" : "lines"}
                      </span>
                    )}
                  </button>
                ) : null}
                {open ? (
                  <div className={section.title !== null ? "pb-1.5" : undefined}>
                    {section.lines.map((line) => (
                      <Row key={line.n} line={line} query={null} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {!matches && log.result ? (
          <div
            data-line={log.result.n}
            className={cn(
              "mx-3 mt-2 mb-1 flex items-center gap-2 rounded-lg px-3 py-2 font-sans text-sm font-medium",
              log.result.kind === "done"
                ? "bg-term-info/12 text-term-info"
                : "bg-term-error/12 text-term-error",
            )}
          >
            {log.result.kind === "done" ? (
              <CheckIcon className="size-4 shrink-0" />
            ) : (
              <XIcon className="size-4 shrink-0" />
            )}
            {log.result.text}
          </div>
        ) : null}

        {live && !matches ? (
          <div className="flex pl-12" aria-hidden="true">
            <span className="term-caret mt-1 inline-block h-3.5 w-1.5 bg-term-dim" />
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
        scrollTo="first-error"
        empty="Waiting for the build to start…"
      />
    </div>
  );
}
