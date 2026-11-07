import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "destructive";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        variant === "outline" && "border bg-background shadow-xs hover:bg-accent",
        variant === "ghost" && "hover:bg-accent",
        variant === "destructive" &&
          "bg-destructive text-background shadow-xs hover:bg-destructive/90",
        className,
      )}
      {...props}
    />
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** A labelled input with an optional hint and error, wired up for screen readers. */
export function Field({ label, hint, error, className, ...props }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm leading-none font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-9 w-full rounded-md border px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 bg-field",
          error ? "border-destructive ring-destructive/20" : "border-input",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 px-4 py-3 text-sm text-destructive"
    >
      {children}
    </div>
  );
}

/** The cap mark in the current text color, so it follows the light and dark theme. */
export function CapMark({ className }: { className?: string }) {
  return (
    <svg viewBox="56 60 280 184" aria-hidden="true" className={className}>
      <path
        d="M74 214 C62 210 62 196 63 180 C64 120 96 82 150 72 C210 64 254 92 266 172 L318 200 C332 208 330 224 312 224 C292 224 276 212 262 204 C232 216 204 236 172 237 C152 237 136 226 124 212 C108 216 90 216 74 214 Z"
        fill="currentColor"
      />
      <path
        d="M186 156 L207 128 L232 150"
        fill="none"
        stroke="var(--background)"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CapMark className="h-6 w-auto" />
      <span className="font-brand text-lg leading-none font-bold">
        nocap<span className="text-muted-foreground">cloud</span>
      </span>
    </span>
  );
}
