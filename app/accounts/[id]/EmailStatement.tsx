"use client";

import { useActionState, useState } from "react";
import { Download, FileText, Mail, Printer } from "lucide-react";
import { Button, FormError, FormOk, Input } from "@/src/components/ui";
import { type EmailState, emailStatementAction } from "./emailActions";

/** Email the statement (with the PDF attached), download it, print it, or make a month's invoice. */
export function EmailStatement({ accountId, defaultTo, from, to, configured, month }: { accountId: string; defaultTo: string; from: string; to: string; configured: boolean; month: string }) {
  const [state, action, pending] = useActionState(emailStatementAction, {} as EmailState);
  const [invoiceMonth, setInvoiceMonth] = useState(month);
  const range = new URLSearchParams({ kind: "statement", ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const base = `/api/accounts/${accountId}/document`;
  return (
    <div className="grid gap-4 rounded-xl border border-line bg-surface p-4 shadow-xs lg:grid-cols-[1.4fr_1fr_1fr] sm:p-5" data-testid="documents">
      <form action={action} className="space-y-1.5" data-testid="email-statement">
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="periodFrom" value={from} />
        <input type="hidden" name="periodTo" value={to} />
        <label htmlFor="statement-email" className="text-[13px] font-medium text-fg/80">Email the statement</label>
        <div className="flex gap-2">
          <Input id="statement-email" type="email" name="email" defaultValue={defaultTo} required placeholder="parent@example.com" />
          <Button type="submit" variant="secondary" disabled={pending || !configured}><Mail aria-hidden />{pending ? "Sending" : "Send"}</Button>
        </div>
        <p className="text-xs text-muted">{configured ? "The PDF goes along as an attachment." : "Email is off on this server."}</p>
        <FormError>{state.error}</FormError><FormOk>{state.ok}</FormOk>
      </form>
      <div className="space-y-1.5">
        <div className="text-[13px] font-medium text-fg/80">Statement PDF</div>
        <div className="flex flex-wrap gap-2">
          <a href={`${base}?${range}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2"><Download className="size-4" aria-hidden />Download</a>
          <Button type="button" variant="secondary" onClick={() => window.print()}><Printer aria-hidden />Print page</Button>
        </div>
        <p className="text-xs text-muted">For the period shown below.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="invoice-month" className="text-[13px] font-medium text-fg/80">Invoice for a month</label>
        <div className="flex gap-2">
          <Input id="invoice-month" type="month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} className="min-w-0" />
          <a
            href={invoiceMonth ? `${base}?kind=invoice&month=${invoiceMonth}` : undefined}
            aria-disabled={!invoiceMonth}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium shadow-xs hover:bg-surface-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <FileText className="size-4" aria-hidden />Invoice
          </a>
        </div>
        <p className="text-xs text-muted">That month&apos;s lessons and the amount due.</p>
      </div>
    </div>
  );
}
