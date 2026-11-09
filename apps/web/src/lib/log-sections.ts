// Groups a build log into steps, the way it reads: one section per "==> Step" line, and the
// final "==> Done" or "==> Failed" line as a result banner.
import { highlightLine, type Line } from "./highlight";

export interface LogLine extends Line {
  /** Line number as shown: step titles and blank lines between steps are not counted. */
  n: number;
  text: string;
}

export type SectionStatus = "running" | "done" | "failed" | "none";

export interface Section {
  /** The step's title, or null for the lines before the first step. */
  title: string | null;
  status: SectionStatus;
  lines: LogLine[];
}

export interface ParsedLog {
  sections: Section[];
  result: { kind: "done" | "failed"; text: string; n: number } | null;
  /** Line numbers of the errors, the failed result included. */
  errors: number[];
  count: number;
}

export function parseLog(text: string, live: boolean): ParsedLog {
  const raw = text.split("\n");
  const sections: Section[] = [];
  let result: ParsedLog["result"] = null;
  const errors: number[] = [];
  let current: Section = { title: null, status: "none", lines: [] };
  let n = 0;

  for (let i = 0; i < raw.length; i += 1) {
    const value = (raw[i] ?? "").replace(/\s+$/, "");
    // Blank lines only separate steps; the step headers already do that.
    if (value === "" && (i === raw.length - 1 || (raw[i + 1] ?? "").startsWith("==>"))) continue;
    const line = highlightLine(value);
    if (line.kind === "step") {
      if (current.title !== null || current.lines.length > 0) sections.push(current);
      current = { title: value.replace(/^==>\s*/, ""), status: "done", lines: [] };
      continue;
    }
    n += 1;
    if (line.kind === "step-done" || line.kind === "step-failed") {
      result = {
        kind: line.kind === "step-done" ? "done" : "failed",
        text: value.replace(/^==>\s*/, ""),
        n,
      };
      if (line.kind === "step-failed") errors.push(n);
      continue;
    }
    if (line.kind === "error") errors.push(n);
    current.lines.push({ ...line, n, text: value });
  }
  if (current.title !== null || current.lines.length > 0) sections.push(current);

  const steps = sections.filter((s) => s.title !== null);
  for (const step of steps) {
    if (step.lines.some((l) => l.kind === "error")) step.status = "failed";
  }
  const last = steps.at(-1);
  if (last) {
    if (live && !result) last.status = "running";
    else if (result?.kind === "failed") last.status = "failed";
  }
  return { sections, result, errors, count: n };
}
