import { prisma } from "@/src/db";
import { requireSession } from "@/src/auth/current";
import { listLibrary } from "@/src/services/files";
import { Button, Card, Empty, PageHeader, Table, TableWrap, Td, Th } from "@/src/components/ui";
import { removeLibraryAction } from "../homework/actions";
import { UploadForm } from "./UploadForm";

export const dynamic = "force-dynamic";

function kb(n: number) { return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`; }

export default async function LibraryPage() {
  const s = await requireSession();
  const rows = await listLibrary(prisma, s.organizationId);
  const folders = [...new Set(rows.map((r) => r.folder).filter((f): f is string => !!f))].sort();
  return (
    <div className="space-y-6">
      <PageHeader title="Library" back={{ href: "/homework", label: "Homework" }} subtitle={`${rows.length} files you can attach to homework.`} />
      <Card title="Add files"><UploadForm folders={folders} /></Card>
      <Card>
        {rows.length === 0 ? <Empty>No files yet.</Empty> : (
          <TableWrap>
            <Table data-testid="library">
              <thead><tr><Th>File</Th><Th className="hidden sm:table-cell">Folder</Th><Th right className="hidden sm:table-cell">Size</Th><Th right>Used</Th><Th></Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.fileId} className="hover:bg-surface-2">
                    <Td><a className="text-brand hover:underline" href={`/api/files/${r.fileId}`}>{r.name}</a></Td>
                    <Td className="hidden text-muted sm:table-cell">{r.folder ?? ""}</Td>
                    <Td right num className="hidden sm:table-cell">{kb(r.sizeBytes)}</Td>
                    <Td right num>{r.usedInAssignments}</Td>
                    <Td right><form action={removeLibraryAction}><input type="hidden" name="fileId" value={r.fileId} /><Button variant="link" className="text-xs text-owed" aria-label={`Remove ${r.name}`}>Remove</Button></form></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
