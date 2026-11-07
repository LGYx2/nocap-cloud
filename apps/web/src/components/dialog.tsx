import { type ReactNode, useEffect, useId, useRef } from "react";
import { XIcon } from "./icons";

/**
 * A modal built on the native <dialog> element, so focus trapping, Escape to close
 * and the backdrop come from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-background p-0 text-foreground shadow-lg"
    >
      <div className="relative p-6">
        <h2 id={titleId} className="pr-8 text-lg leading-none font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <XIcon />
        </button>
        <div className="mt-5">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
