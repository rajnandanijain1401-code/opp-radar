import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-mono text-xs text-faint">404</p>
      <h1 className="mt-2 font-display text-5xl">Off the radar</h1>
      <p className="mt-3 text-muted">That page does not exist.</p>
      <Link
        href="/"
        className="mt-6 inline-block font-semibold text-accent underline underline-offset-2"
      >
        Back home
      </Link>
    </div>
  );
}
