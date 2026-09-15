import { currentSession } from "@/src/auth/current";
import { registrationOpen } from "@/src/auth/registration";
import { Landing } from "../Landing";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Resolventum" } };

/** The front page, reachable any time from the R in the corner. Signed in, its buttons lead back into the app. */
export default async function WelcomePage() {
  const s = await currentSession();
  return <Landing signupOpen={registrationOpen()} signedIn={!!s} />;
}
