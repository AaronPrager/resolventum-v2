/** Plain-text emails the app sends. Kept short; families read these on phones. */
import { formatCents } from "../lib/format";
import type { Statement } from "../services/statement";

export function statementEmail(opts: { orgName: string; accountName: string; st: Statement; venmo?: string | null; zelle?: string | null }): { subject: string; text: string } {
  const { st } = opts;
  const period = st.from && st.to ? `${st.from.toISOString().slice(0, 10)} to ${st.to.toISOString().slice(0, 10)}` : "all time";
  const lines = st.entries.map((e) => {
    const d = e.date.toISOString().slice(0, 10);
    const amt = e.kind === "charge" ? `+${formatCents(e.deltaCents)}` : `-${formatCents(-e.deltaCents)}`;
    return `${d}  ${e.description.padEnd(40).slice(0, 40)}  ${amt.padStart(11)}`;
  });
  const bal = st.closingBalanceCents;
  const balText = bal > 0 ? `Balance due: ${formatCents(bal)}` : bal < 0 ? `Credit on account: ${formatCents(-bal)}` : "Balance: $0.00";
  const pay = [opts.venmo && `Venmo ${opts.venmo}`, opts.zelle && `Zelle ${opts.zelle}`].filter(Boolean).join(" or ");
  return {
    subject: `${opts.orgName}: statement for ${opts.accountName} (${period})`,
    text: [
      `Statement for ${opts.accountName}`, `Period: ${period}`, "",
      st.from ? `Opening balance: ${formatCents(st.openingBalanceCents)}` : null, "",
      ...lines, "",
      balText,
      bal > 0 && pay ? `You can pay by ${pay}.` : null, "",
      `Thank you,`, opts.orgName,
    ].filter((l) => l !== null).join("\n"),
  };
}

export function homeworkLinkEmail(opts: { orgName: string; studentFirst: string; title: string; dueOn: string | null; url: string; description?: string | null }): { subject: string; text: string } {
  return {
    subject: `${opts.orgName}: homework for ${opts.studentFirst}, ${opts.title}`,
    text: [
      `Hi ${opts.studentFirst},`, "",
      `Here is your homework: ${opts.title}${opts.dueOn ? `, due ${opts.dueOn}` : ""}.`,
      opts.description ? `\n${opts.description}\n` : "",
      `Open this link to see the files and send your work back (a PDF or photos of each page):`, opts.url, "",
      `Thank you,`, opts.orgName,
    ].join("\n"),
  };
}
