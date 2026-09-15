import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/src/db";
import { requireSession, tutorScope } from "@/src/auth/current";
import { StudentPanel } from "../StudentPanel";

export const dynamic = "force-dynamic";

/** One student's page: a way back to the list, then the panel. */
export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const q = await searchParams;
  const me = await prisma.student.findFirst({ where: { id, organizationId: session.organizationId, deletedAt: null }, select: { archivedAt: true, lessons: { select: { lesson: { select: { tutorId: true } } } } } });
  if (!me) notFound();
  const scope = tutorScope(session);
  if (scope && !me.lessons.some((l) => l.lesson.tutorId === scope)) notFound();
  return (
    <div className="space-y-4">
      <Link href={me.archivedAt ? "/students?status=ARCHIVED" : "/students"} className="-ml-1 inline-flex items-center gap-0.5 rounded text-[13px] text-muted hover:text-fg"><ChevronLeft className="size-4" aria-hidden />Students</Link>
      <StudentPanel id={id} session={session} all={q.all === "1"} />
    </div>
  );
}
