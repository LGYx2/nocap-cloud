import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-indigo text-white hover:bg-indigo-hover",
        variant === "ghost" && "text-ink-soft hover:bg-mist hover:text-ink",
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
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 rounded-xl border bg-field px-3.5 text-sm text-ink placeholder:text-ink-soft/70 focus:border-indigo-text focus:outline-none focus:ring-2 focus:ring-indigo-text/25",
          error ? "border-danger" : "border-line",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
      {children}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img src="/logo.svg" alt="" className="h-8 w-auto" />
      <span className="font-brand text-xl font-bold leading-none">
        <span className="text-ink">nocap</span>
        <span className="text-indigo-text">cloud</span>
      </span>
    </span>
  );
}
