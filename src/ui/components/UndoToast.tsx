import { X } from "lucide-react";
import { useEffect, useRef } from "react";

const AUTO_DISMISS_MS = 6000;

/**
 * A transient bottom-left notice with a single undo action. Mount it with a
 * key per notification so the auto-dismiss timer restarts for each one.
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="undo-toast" role="status">
      <span className="undo-toast-message">{message}</span>
      <button className="undo-toast-action" type="button" onClick={onUndo}>
        Undo
      </button>
      <button className="panel-close-button" type="button" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={13} />
      </button>
    </div>
  );
}
