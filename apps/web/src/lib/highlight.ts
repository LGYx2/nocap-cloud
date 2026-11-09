// Light syntax coloring for build and app logs. No library: one regex pass per line, cached,
// so a log that grows every second only colors its new lines.

export type TokenKind =
  | "dim" // timestamps, digests, durations
  | "link" // URLs
  | "accent" // build steps, HTTP methods, prompts
  | "info" // INFO, LOG
  | "ok" // ready, done, 2xx
  | "warn" // WARN, 4xx
  | "error" // ERROR, 5xx
  | "string"; // "quoted"

export interface Token {
  text: string;
  kind?: TokenKind;
}

export type LineKind = "plain" | "step" | "step-failed" | "step-done" | "error" | "warn";

export interface Line {
  kind: LineKind;
  tokens: Token[];
}

const PATTERNS: Array<[TokenKind | "status", string]> = [
  ["dim", String.raw`\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?`],
  ["dim", String.raw`\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b`],
  // A URL never ends with the punctuation of the sentence around it.
  ["link", String.raw`https?:\/\/[^\s"'<>)\]]*[^\s"'<>)\].,;:!?]`],
  ["dim", String.raw`sha256:[0-9a-f]{8,}`],
  ["accent", String.raw`^#\d+|\[\d+\/\d+\]|\bStep \d+\/\d+\b|^\$(?= )|^==>`],
  ["error", String.raw`\b(?:ERROR|ERR!|FATAL|PANIC|CRITICAL|Error|error|failed|Failed)\b:?`],
  ["warn", String.raw`\b(?:WARN|WARNING|Warning|warn|DEPRECATED|deprecated)\b:?`],
  ["info", String.raw`\b(?:INFO|LOG|NOTICE)\b:?`],
  ["dim", String.raw`\b(?:DEBUG|TRACE)\b:?`],
  [
    "ok",
    String.raw`\b(?:ready|Ready|Done|done|Listening|listening|Pull complete|passed|Successfully|successfully|finished|applied)\b`,
  ],
  ["accent", String.raw`\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b`],
  ["status", String.raw`(?<=\s)[1-5]\d\d(?=\s|$)`],
  ["dim", String.raw`\b\d+(?:\.\d+)?(?:ms|s)\b`],
  ["string", String.raw`"[^"\n]{0,200}"|'[^'\n]{0,200}'`],
];

const REGEX = new RegExp(PATTERNS.map(([, source]) => `(${source})`).join("|"), "g");

const STATUS: Record<string, TokenKind> = { "2": "ok", "3": "accent", "4": "warn", "5": "error" };

const ERROR_LINE = /\b(?:ERROR|ERR!|FATAL|PANIC|Error:|error:|exit code: ?[1-9]|exit code [1-9])/;
const WARN_LINE = /\b(?:WARN|WARNING|Warning:|DEPRECATED)\b/;

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let http = false;
  REGEX.lastIndex = 0;
  for (let match = REGEX.exec(line); match; match = REGEX.exec(line)) {
    if (match[0] === "") {
      REGEX.lastIndex += 1;
      continue;
    }
    const group = match.findIndex((value, i) => i > 0 && value !== undefined);
    let kind = PATTERNS[group - 1]?.[0];
    if (kind === "accent" && /^[A-Z]+$/.test(match[0])) http = true;
    if (kind === "status") {
      // A three digit number is a status code only on a line with an HTTP method.
      kind = http ? (STATUS[match[0][0] ?? ""] ?? undefined) : undefined;
      if (!kind) continue;
    }
    if (match.index > last) tokens.push({ text: line.slice(last, match.index) });
    tokens.push({ text: match[0], kind });
    last = match.index + match[0].length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last) });
  return tokens;
}

function classify(line: string): LineKind {
  if (line.startsWith("==> Failed")) return "step-failed";
  if (line.startsWith("==> Done")) return "step-done";
  if (line.startsWith("==>")) return "step";
  if (ERROR_LINE.test(line)) return "error";
  if (WARN_LINE.test(line)) return "warn";
  return "plain";
}

const cache = new Map<string, Line>();

export function highlightLine(line: string): Line {
  const hit = cache.get(line);
  if (hit) return hit;
  const kind = classify(line);
  let tokens = tokenize(line);
  // "did not complete successfully" on an error line is not good news.
  if (kind === "error") {
    tokens = tokens.map((t) => (t.kind === "ok" ? { text: t.text } : t));
  }
  const result: Line = { kind, tokens };
  if (cache.size > 5000) cache.clear();
  cache.set(line, result);
  return result;
}

export interface UrlPart {
  text: string;
  kind?: "scheme" | "secret" | "host" | "rest";
}

/** Splits a URL into parts to color: scheme, credentials, host, and the rest. */
export function splitUrl(url: string): UrlPart[] {
  const match = /^([a-z][a-z0-9+.-]*:\/\/)(?:([^@/]*)@)?([^/:?#]+)(.*)$/i.exec(url);
  if (!match) return [{ text: url }];
  const [, scheme = "", auth, host = "", rest = ""] = match;
  const parts: UrlPart[] = [{ text: scheme, kind: "scheme" }];
  if (auth !== undefined) {
    const colon = auth.indexOf(":");
    if (colon >= 0) {
      parts.push({ text: auth.slice(0, colon + 1) });
      parts.push({ text: auth.slice(colon + 1), kind: "secret" });
    } else {
      parts.push({ text: auth });
    }
    parts.push({ text: "@" });
  }
  parts.push({ text: host, kind: "host" });
  if (rest) parts.push({ text: rest, kind: "rest" });
  return parts;
}
