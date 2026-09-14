"use client";

import { useActionState, useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Trash2, X } from "lucide-react";
import { AddRow, Badge, Button, FormError, IconButton, Input, Row, RowActions, Rows } from "@/src/components/ui";
import { type ActionState, addHolidayAction, categoryArchiveAction, categoryDeleteAction, removeHolidayAction, saveCategoryAction } from "./actions";

// ---------------------------------------------------------------- lesson categories

export interface CategoryRow { id: string; name: string; lessons: number; archived: boolean }

/** One category: its name, how many lessons use it, and pencil, archive, and trash on hover. Rename happens in the row. */
function CategoryItem({ c, canEdit }: { c: CategoryRow; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, rename, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await saveCategoryAction(prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }, {} as ActionState);
  const [delState, del, deleting] = useActionState(categoryDeleteAction, {} as ActionState);
  return (
    <Row data-testid={`category-${c.id}`} className={c.archived ? "text-muted" : ""}>
      {editing ? (
        <form action={rename} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="categoryId" value={c.id} />
          <Input name="name" defaultValue={c.name} aria-label={`Rename ${c.name}`} className="h-8 w-56" autoFocus required onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }} />
          <Button type="submit" variant="primary" className="h-8 px-2.5" disabled={pending}><Check aria-hidden />{pending ? "Saving" : "Save"}</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <FormError>{state.error}</FormError>
        </form>
      ) : (
        <>
          <span className="font-medium">{c.name}</span>
          <span className="text-xs text-muted tabular-nums">{c.lessons} lesson{c.lessons === 1 ? "" : "s"}</span>
          {c.archived && <Badge>archived</Badge>}
          {canEdit && (
            <RowActions>
              <IconButton label={`Rename ${c.name}`} onClick={() => setEditing(true)}><Pencil aria-hidden /></IconButton>
              <form action={categoryArchiveAction} className="inline-flex">
                <input type="hidden" name="categoryId" value={c.id} />
                <input type="hidden" name="archived" value={c.archived ? "0" : "1"} />
                <IconButton type="submit" label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}>{c.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}</IconButton>
              </form>
              {c.lessons === 0 && (
                <form action={del} className="inline-flex" onSubmit={(e) => { if (!window.confirm(`Delete "${c.name}"?`)) e.preventDefault(); }}>
                  <input type="hidden" name="categoryId" value={c.id} />
                  <IconButton type="submit" tone="danger" label={`Delete ${c.name}`} disabled={deleting}><Trash2 aria-hidden /></IconButton>
                </form>
              )}
            </RowActions>
          )}
          {delState.error && <span className="basis-full text-xs text-owed">{delState.error}</span>}
        </>
      )}
    </Row>
  );
}

export function CategoryList({ categories, canEdit }: { categories: CategoryRow[]; canEdit: boolean }) {
  const [state, add, pending] = useActionState(saveCategoryAction, {} as ActionState);
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-3" data-testid="categories-card">
      {categories.length > 0 && <Rows data-testid="categories">{categories.map((c) => <CategoryItem key={c.id} c={c} canEdit={canEdit} />)}</Rows>}
      {canEdit ? (
        <AddRow>
          <form key={key} action={async (fd) => { await add(fd); setKey((k) => k + 1); }} className="flex flex-1 flex-wrap items-center gap-2" data-testid="category-form-new">
            <Input name="name" placeholder={categories.length ? "Another category" : "Tutoring, test prep, enrichment"} aria-label="New category" className="h-8 min-w-40 flex-1" required />
            <Button type="submit" variant="secondary" className="h-8 px-2.5" disabled={pending}>{pending ? "Adding" : "Add"}</Button>
            <FormError>{state.error}</FormError>
          </form>
        </AddRow>
      ) : categories.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- school holidays

export interface HolidayRow { id: string; name: string; from: string; to: string | null }

export function HolidayList({ holidays, canEdit }: { holidays: HolidayRow[]; canEdit: boolean }) {
  const [state, add, pending] = useActionState(addHolidayAction, {} as ActionState);
  const [key, setKey] = useState(0);
  return (
    <div className="space-y-3" data-testid="holidays-card">
      {holidays.length > 0 && (
        <Rows data-testid="holidays">
          {holidays.map((h) => (
            <Row key={h.id}>
              <span className="font-medium">{h.name}</span>
              <span className="text-xs text-muted tabular-nums">{h.from}{h.to && ` to ${h.to}`}</span>
              {canEdit && (
                <RowActions>
                  <form action={removeHolidayAction} className="inline-flex" onSubmit={(e) => { if (!window.confirm(`Remove ${h.name}?`)) e.preventDefault(); }}>
                    <input type="hidden" name="holidayId" value={h.id} />
                    <IconButton type="submit" tone="danger" label={`Remove ${h.name}`}><Trash2 aria-hidden /></IconButton>
                  </form>
                </RowActions>
              )}
            </Row>
          ))}
        </Rows>
      )}
      {canEdit ? (
        <AddRow>
          <form key={key} action={async (fd) => { await add(fd); setKey((k) => k + 1); }} className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2" data-testid="holiday-form">
            <Input name="name" placeholder="Winter break" aria-label="Holiday name" className="h-8 col-span-full" required />
            <Input type="date" name="startsOn" aria-label="From" className="h-8" required />
            <span className="text-xs text-muted">to</span>
            <Input type="date" name="endsOn" aria-label="To" className="h-8" />
            <Button type="submit" variant="secondary" className="h-8 px-2.5" disabled={pending}>{pending ? "Adding" : "Add"}</Button>
            {state.error && <div className="col-span-full"><FormError>{state.error}</FormError></div>}
          </form>
        </AddRow>
      ) : holidays.length === 0 ? <p className="text-sm text-muted">None yet.</p> : null}
      <p className="text-xs text-muted">Leave the end empty for a one-day holiday. Lessons already made stay; only new ones skip these days.</p>
      {state.ok && <p role="status" className="text-xs text-credit">{state.ok}</p>}
    </div>
  );
}
