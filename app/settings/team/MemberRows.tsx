"use client";

import { useRef, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { Avatar, Badge, IconButton, Row, RowActions, Rows } from "@/src/components/ui";
import { cancelInvitationAction, changeRoleAction, linkTutorAction, removeMemberAction } from "./actions";

export interface MemberRowData { id: string; userId: string; name: string; email: string; role: string; tutorId: string | null }

const select = "h-8 rounded-lg border border-line bg-surface pl-2.5 pr-7 text-xs shadow-xs hover:border-line-strong focus:border-brand focus:outline-none";

/** A select that saves the moment it changes. The label sits in the tooltip and the accessible name. */
function AutoSelect({ action, hidden, name, label, value, children }: { action: (fd: FormData) => Promise<void>; hidden: Record<string, string>; name: string; label: string; value: string; children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form ref={form} action={(fd) => start(() => action(fd))} className="inline-flex">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <select name={name} defaultValue={value} aria-label={label} title={label} disabled={pending} onChange={() => form.current?.requestSubmit()} className={select}>
        {children}
      </select>
    </form>
  );
}

export function MemberRows({ members, tutors, roles, meId, owner }: { members: MemberRowData[]; tutors: { id: string; name: string }[]; roles: string[]; meId: string; owner: boolean }) {
  return (
    <Rows data-testid="members">
      {members.map((m) => {
        const me = m.userId === meId;
        const teachesAs = tutors.find((t) => t.id === m.tutorId)?.name;
        return (
          <Row key={m.id} className="py-2.5">
            <Avatar name={m.name} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-medium">{m.name}{me && <span className="ml-2 text-xs font-normal text-muted">you</span>}</div>
              <div className="truncate text-xs text-muted">{m.email}{m.role === "TUTOR" && !owner && ` · ${teachesAs ? `teaches as ${teachesAs}` : "not linked to a tutor"}`}</div>
            </div>
            {owner && !me ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {m.role === "TUTOR" && (
                  <AutoSelect action={linkTutorAction} hidden={{ membershipId: m.id }} name="tutorId" label={`Tutor for ${m.name}`} value={m.tutorId ?? ""}>
                    <option value="">Not linked to a tutor</option>
                    {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </AutoSelect>
                )}
                <AutoSelect action={changeRoleAction} hidden={{ membershipId: m.id }} name="role" label={`Role for ${m.name}`} value={m.role}>
                  {roles.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                </AutoSelect>
              </span>
            ) : (
              <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{m.role.toLowerCase()}</Badge>
            )}
            {owner && !me && (
              <RowActions>
                <form action={removeMemberAction} className="inline-flex" onSubmit={(e) => { if (!window.confirm(`Remove ${m.name}? They are signed out and can no longer open this school.`)) e.preventDefault(); }}>
                  <input type="hidden" name="membershipId" value={m.id} />
                  <IconButton type="submit" tone="danger" label={`Remove ${m.name}`}><Trash2 aria-hidden /></IconButton>
                </form>
              </RowActions>
            )}
          </Row>
        );
      })}
    </Rows>
  );
}

export function InvitationRows({ invitations, owner }: { invitations: { id: string; email: string; role: string; expires: string; expired: boolean }[]; owner: boolean }) {
  return (
    <Rows data-testid="invitations">
      {invitations.map((i) => (
        <Row key={i.id}>
          <span className="font-medium">{i.email}</span>
          <Badge>{i.role.toLowerCase()}</Badge>
          <span className={`text-xs ${i.expired ? "text-owed" : "text-muted"}`}>{i.expired ? "expired" : `expires ${i.expires}`}</span>
          {owner && (
            <RowActions>
              <form action={cancelInvitationAction} className="inline-flex">
                <input type="hidden" name="invitationId" value={i.id} />
                <IconButton type="submit" tone="danger" label={`Cancel the invitation to ${i.email}`}><X aria-hidden /></IconButton>
              </form>
            </RowActions>
          )}
        </Row>
      ))}
    </Rows>
  );
}
