import type { DatabaseEngine, StackId } from "@nocap/shared";
import { BRAND_COLORS, type BrandId } from "../lib/brand-colors";
import { GitBranchIcon } from "./icons";
import { cn } from "./ui";

/**
 * A brand mark (PostgreSQL, Node.js, GitHub and so on). The shapes are small SVG files used as
 * a CSS mask, so they add no JavaScript and the browser fetches only the ones on screen.
 */
export function BrandIcon({ name, className }: { name: BrandId; className?: string }) {
  const mask = `url(/brands/${name}.svg) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-4 shrink-0", className)}
      style={{
        backgroundColor: BRAND_COLORS[name] ?? "currentColor",
        mask,
        WebkitMask: mask,
      }}
    />
  );
}

/** The icon tile of an app or a database: its engine, its language or framework, or Git. */
export function ServiceIcon({
  stack,
  engine,
  className,
  iconClassName = "size-[18px]",
}: {
  stack?: StackId | null;
  engine?: DatabaseEngine | null;
  className?: string;
  iconClassName?: string;
}) {
  const brand: BrandId | null = engine ?? stack ?? null;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/60",
        className,
      )}
    >
      {brand ? (
        <BrandIcon name={brand} className={iconClassName} />
      ) : (
        <GitBranchIcon className={cn(iconClassName, "text-muted-foreground")} />
      )}
    </span>
  );
}
