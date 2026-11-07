import { useState } from "react";

const SITE_URL = "https://nocapcloud.click";

/** Floating note shown only in the demo build: what the demo is, a reset, and where to get the real thing. */
export function DemoBanner() {
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    const { resetDemo } = await import("../demo");
    resetDemo();
    window.location.assign("/");
  }

  return (
    <div
      role="note"
      className="fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-full border bg-background py-1 pr-1 pl-3.5 text-xs shadow-lg"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden="true" />
      <span className="ml-1 truncate">
        <span className="font-medium">Demo</span>
        <span className="hidden text-muted-foreground sm:inline">
          {" "}
          · sample data, changes stay in this browser
        </span>
      </span>
      <button
        type="button"
        onClick={() => void reset()}
        disabled={resetting}
        className="ml-1 shrink-0 rounded-full px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        Reset
      </button>
      <a
        href={SITE_URL}
        className="shrink-0 rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <span aria-hidden="true">← </span>Back to website
      </a>
    </div>
  );
}
