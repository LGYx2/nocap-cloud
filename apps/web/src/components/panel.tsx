import { type ReactNode, useState } from "react";
import { CheckIcon } from "./icons";
import { Button, cn } from "./ui";

/** A card with a title, optional description and an optional footer bar for actions. */
export function Panel({
  title,
  description,
  children,
  footer,
  danger,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-xs",
        danger && "border-destructive/40",
        className,
      )}
    >
      <div className="p-5">
        <h3 className={cn("text-sm font-semibold", danger && "text-destructive")}>{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t bg-muted/40 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** A copy button that confirms for a moment after copying. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <CheckIcon /> : null}
      {copied ? "Copied" : label}
    </Button>
  );
}
