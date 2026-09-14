"use client";

import { useState } from "react";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { AddRow, Badge, Button, IconButton, Row, RowActions, Rows } from "@/src/components/ui";
import { removeGuardianAction } from "../actions";
import { GuardianForm, type GuardianValues } from "./FamilyForms";

/**
 * The family's contacts as rows: name, relationship, what they get, and how
 * to reach them. The pencil opens the full form under the row; the trash
 * removes after a confirmation. Adding opens the same form under a dashed row.
 */
export function ContactList({ accountId, contacts, canEdit }: { accountId: string; contacts: (GuardianValues & { id: string })[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(contacts.length === 0 && canEdit);
  return (
    <div className="space-y-3">
      {contacts.length > 0 && (
        <Rows data-testid="guardians">
          {contacts.map((g) => (
            <Row key={g.id} className={editing === g.id ? "flex-col items-stretch bg-surface-2/50" : ""}>
              <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{g.name}</span>
                {g.relationship && <span className="text-muted">{g.relationship}</span>}
                {g.isPrimary && <Badge tone="brand">main</Badge>}
                {g.isBilling && <Badge>statements</Badge>}
                {g.isEmergency && <Badge tone="warn">emergency</Badge>}
                <span className="text-muted">{[g.email, g.phone].filter(Boolean).join(" · ")}</span>
                {canEdit && editing !== g.id && (
                  <RowActions>
                    <IconButton label={`Edit ${g.name}`} onClick={() => { setEditing(g.id); setAdding(false); }}><Pencil aria-hidden /></IconButton>
                    <form action={removeGuardianAction} className="inline-flex" onSubmit={(e) => { if (!window.confirm(`Remove ${g.name} from this account?`)) e.preventDefault(); }}>
                      <input type="hidden" name="guardianId" value={g.id} /><input type="hidden" name="accountId" value={accountId} />
                      <IconButton type="submit" tone="danger" label={`Remove ${g.name}`}><Trash2 aria-hidden /></IconButton>
                    </form>
                  </RowActions>
                )}
              </div>
              {editing === g.id && (
                <div className="mt-2 w-full border-t border-line pt-3">
                  <GuardianForm accountId={accountId} guardian={g} onDone={() => setEditing(null)} />
                </div>
              )}
            </Row>
          ))}
        </Rows>
      )}
      {contacts.length === 0 && !canEdit && <p className="text-sm text-muted">No contacts yet.</p>}
      {canEdit && (adding ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface-2/40 p-3">
          <p className="mb-3 text-sm font-medium">New contact</p>
          <GuardianForm accountId={accountId} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <AddRow>
          <Button type="button" variant="ghost" className="h-8" onClick={() => { setAdding(true); setEditing(null); }}><UserPlus aria-hidden />Add a contact</Button>
          {contacts.length === 0 && <span className="text-xs text-muted">Add a parent so statements have somewhere to go.</span>}
        </AddRow>
      ))}
    </div>
  );
}
