import type { ReactNode } from "react";
import { Logo } from "../components/ui";

/** Centered card used by the setup and login screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-8 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </main>
  );
}
