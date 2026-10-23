import type { ReactNode } from "react";
import { MdClose } from "../../icons";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Max width override for desktop. */
  maxWidth?: number;
}

/**
 * Responsive modal that becomes a bottom-sheet on phones and a centred
 * dialog on tablet/desktop. Closes when the overlay is clicked or `onClose`
 * is invoked from the close button.
 */
export default function Modal({ open, title, onClose, children, footer, maxWidth }: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
            style={{ width: 36, height: 36 }}
          >
            <MdClose size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
