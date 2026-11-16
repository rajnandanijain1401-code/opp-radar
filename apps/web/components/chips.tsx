"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ChipToggle({
  options,
  value,
  onChange,
  name,
}: {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={name}>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              on
                ? "border-ink bg-ink text-white"
                : "border-line bg-card text-ink hover:border-ink/40",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TagInput({
  value,
  onChange,
  placeholder,
  max,
  label,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  max: number;
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const next = [...value];
    for (const p of parts)
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm focus:border-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={add}
          className="h-10 shrink-0 rounded-lg border border-line bg-card px-4 text-sm font-semibold hover:bg-paper"
        >
          Add
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-3 py-1 text-sm"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              <X className="h-3.5 w-3.5 text-muted hover:text-ink" />
            </button>
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">
        {value.length}/{max}
      </p>
    </div>
  );
}
