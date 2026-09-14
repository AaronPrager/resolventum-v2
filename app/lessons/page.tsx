import { redirect } from "next/navigation";

/** Lessons live on the calendar; the bare path just goes there. */
export default function LessonsIndex() {
  redirect("/calendar");
}
