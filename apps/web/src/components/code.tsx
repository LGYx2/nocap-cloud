import { splitUrl, type UrlPart } from "../lib/highlight";
import { cn } from "./ui";

const URL_CLASS: Record<NonNullable<UrlPart["kind"]>, string> = {
  scheme: "text-code-accent",
  secret: "text-code-warn",
  host: "text-code-info",
  rest: "text-muted-foreground",
};

/** A one-line code value, like a connection URL or a hook URL, with its parts colored. */
export function CodeValue({ value, className }: { value: string; className?: string }) {
  const parts = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? splitUrl(value) : [{ text: value }];
  return (
    <code
      className={cn(
        "block min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs",
        className,
      )}
      title={value}
    >
      {parts.map((part, i) =>
        part.kind ? (
          <span key={i} className={URL_CLASS[part.kind]}>
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </code>
  );
}
