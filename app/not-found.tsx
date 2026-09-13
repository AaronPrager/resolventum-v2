import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Not here</h1>
      <p className="mt-2 text-sm text-muted">That page or record does not exist, or belongs to another school.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-brand hover:underline">Back to accounts</Link>
    </div>
  );
}
