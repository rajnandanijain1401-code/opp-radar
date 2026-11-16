export function Prose({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-5xl">{title}</h1>
      <p className="mt-2 font-mono text-xs text-faint">Last updated {updated}</p>
      <div className="mt-8 space-y-5 leading-relaxed text-ink/90 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
