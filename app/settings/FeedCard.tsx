"use client";

import { useActionState } from "react";
import { Button, Card } from "@/src/components/ui";
import { type FeedState, enableFeedAction, revokeFeedAction } from "./actions";

export function FeedCard({ enabled, since, origin }: { enabled: boolean; since: string | null; origin: string }) {
  const [state, enable, pending] = useActionState(enableFeedAction, {} as FeedState);
  // The link is only meaningful while the feed is on; after Turn off the server re-renders with enabled=false.
  const shownUrl = enabled ? state.url : undefined;
  const webcal = shownUrl?.replace(/^https?:/, "webcal:");
  return (
    <Card title="Calendar feed">
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          A private link that Apple Calendar, Google Calendar, or Outlook can subscribe to. It shows every lesson from the last three months
          to a year ahead, with cancellations marked. Anyone with the link can see your schedule, so treat it like a password.
        </p>
        {shownUrl ? (
          <div className="space-y-2 rounded-md bg-brand-soft p-3" data-testid="feed-url">
            <p className="font-medium">Your feed link. It is shown once; regenerate to get a new one.</p>
            <code className="block break-all rounded bg-surface px-2 py-1 text-xs">{shownUrl}</code>
            <p className="text-muted">
              Apple Calendar: File, New Calendar Subscription, paste the link. Or <a className="text-brand hover:underline" href={webcal}>open it in Apple Calendar</a>.
              Google Calendar: Other calendars, From URL, paste the link.
            </p>
          </div>
        ) : enabled ? (
          <p>Enabled{since && ` since ${since}`}. The link was shown when it was created. Regenerate to get a new link; the old one stops working.</p>
        ) : (
          <p>Not enabled.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <form action={enable}>
            <input type="hidden" name="origin" value={origin} />
            <Button type="submit" disabled={pending}>{enabled ? "Regenerate link" : "Enable feed"}</Button>
          </form>
          {enabled && (
            <form action={revokeFeedAction}>
              <Button type="submit" variant="danger">Turn off</Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
