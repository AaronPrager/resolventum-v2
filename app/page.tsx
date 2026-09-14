import { redirect } from "next/navigation";

/** The calendar is where the day starts. */
export default function Home() {
  redirect("/calendar");
}
