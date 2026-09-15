"use client";

import { useState, type ReactNode } from "react";
import { Pencil, X } from "lucide-react";
import { Button, PageHeader } from "./ui";

/**
 * A record's page: opens read-only, and Edit swaps the overview for the form
 * without leaving the page. Payments and expenses use it; lessons have their
 * own with delete built in. `?edit=1` opens it editing.
 */
export function RecordScreen({ title, editTitle, back, subtitle, canEdit, defaultEditing, actions, overview, form, children }: {
  title: ReactNode;
  editTitle?: ReactNode;
  back: { href: string; label: string };
  subtitle?: ReactNode;
  /** False hides the Edit button: read-only role, voided, reported. */
  canEdit: boolean;
  defaultEditing?: boolean;
  /** Extra header buttons, shown in both modes. */
  actions?: ReactNode;
  overview: ReactNode;
  form: ReactNode;
  /** Shown under the overview or the form, in both modes. */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(!!defaultEditing && canEdit);
  return (
    <div className="space-y-6">
      <PageHeader
        title={editing ? editTitle ?? title : title}
        back={back}
        subtitle={subtitle}
        actions={(canEdit || actions) && (
          <>
            {canEdit && (editing
              ? <Button variant="secondary" type="button" onClick={() => setEditing(false)}><X aria-hidden />Stop editing</Button>
              : <Button variant="secondary" type="button" onClick={() => setEditing(true)} data-testid="edit-record"><Pencil aria-hidden />Edit</Button>)}
            {actions}
          </>
        )}
      />
      {editing ? form : overview}
      {children}
    </div>
  );
}

/** One line of an overview: a small label over the value. */
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
