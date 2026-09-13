"use client";

import { Button } from "@/src/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">Nothing was saved. Try again, and if it keeps happening tell us what you were doing.{error.digest && <> Reference {error.digest}.</>}</p>
      <Button className="mt-4" onClick={reset}>Try again</Button>
    </div>
  );
}
