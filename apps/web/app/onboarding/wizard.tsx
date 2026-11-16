"use client";

import { useEffect, useState, useTransition } from "react";
import type { Signal, UserProfile } from "@opp-radar/core/schemas";
import { ChipToggle, TagInput } from "@/components/chips";
import { SignalCard } from "@/components/signal-card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { completeOnboarding, previewAction, type Draft } from "./actions";

const STEP_TITLES = [
  "What roles are you after?",
  "Which sectors and places?",
  "Companies to watch",
  "Here's what you would have received",
  "How should we reach you?",
];

export function OnboardingWizard(props: {
  roles: { id: UserProfile["roles"][number]; label: string }[];
  sectors: string[];
  geos: string[];
  maxWatchlist: number;
  canInstant: boolean;
  canDaily: boolean;
  initial?: UserProfile;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    roles: props.initial?.roles ?? [],
    seniority: props.initial?.seniority ?? null,
    sectors: props.initial?.sectors ?? [],
    geographies: props.initial?.geographies ?? [],
    watchlist_companies: props.initial?.watchlist_companies ?? [],
    instant_alerts_enabled: props.initial?.instant_alerts_enabled ?? props.canInstant,
    digest_frequency: props.initial?.digest_frequency ?? (props.canDaily ? "daily" : "weekly"),
    digest_hour_local: props.initial?.digest_hour_local ?? 8,
    timezone: props.initial?.timezone ?? "Asia/Kolkata",
  });
  const [preview, setPreview] = useState<
    { signal: Signal; score: number; reasons: string[] }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (props.initial) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setDraft((d) => ({ ...d, timezone: tz }));
    } catch {
      /* keep default */
    }
  }, [props.initial]);

  useEffect(() => {
    if (step !== 3) return;
    setPreview(null);
    start(async () => setPreview((await previewAction(draft)).items));
  }, [step]);

  const canNext = step !== 0 || (draft.roles?.length ?? 0) > 0;
  const zones = (() => {
    try {
      return (
        (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
          "timeZone",
        ) ?? [draft.timezone!]
      );
    } catch {
      return [draft.timezone!];
    }
  })();

  return (
    <div>
      <ol className="flex gap-1.5" aria-label="Progress">
        {STEP_TITLES.map((t, i) => (
          <li
            key={t}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`}
            aria-current={i === step ? "step" : undefined}
          />
        ))}
      </ol>
      <p className="mt-6 font-mono text-xs text-faint">
        Step {step + 1} of {STEP_TITLES.length}
      </p>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl">{STEP_TITLES[step]}</h1>

      <div className="mt-8 min-h-64">
        {step === 0 && (
          <div className="space-y-6">
            <ChipToggle
              name="roles"
              options={props.roles}
              value={draft.roles ?? []}
              onChange={(v) => set({ roles: v as Draft["roles"] })}
            />
            <div className="max-w-xs">
              <Label htmlFor="seniority">Seniority (optional)</Label>
              <Select
                id="seniority"
                value={draft.seniority ?? ""}
                onChange={(e) => set({ seniority: e.target.value || null })}
              >
                <option value="">Any</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead / Staff</option>
                <option value="executive">Executive</option>
              </Select>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-8">
            <div>
              <Label>Sectors</Label>
              <ChipToggle
                name="sectors"
                options={props.sectors.map((s) => ({ id: s, label: s }))}
                value={draft.sectors ?? []}
                onChange={(v) => set({ sectors: v })}
              />
            </div>
            <div>
              <Label>Geographies</Label>
              <ChipToggle
                name="geographies"
                options={props.geos.map((s) => ({ id: s, label: s }))}
                value={draft.geographies ?? []}
                onChange={(v) => set({ geographies: v })}
              />
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <p className="mb-4 text-muted">
              Any news about these companies scores as fully relevant. Add the places you would love
              to work. Separate with commas or press Enter.
            </p>
            <TagInput
              label="Company name"
              value={draft.watchlist_companies ?? []}
              onChange={(v) => set({ watchlist_companies: v })}
              placeholder="e.g. Zeta Pay, Fieldstack"
              max={props.maxWatchlist}
            />
          </div>
        )}
        {step === 3 && (
          <div>
            <p className="mb-5 text-muted">
              Signals from the last 7 days, scored against what you just told us.
            </p>
            {pending || !preview ? (
              <p className="text-sm text-muted">Scoring the last week of signals...</p>
            ) : preview.length ? (
              <div className="grid gap-4" data-testid="onboarding-preview">
                {preview.map((p) => (
                  <SignalCard
                    key={p.signal.id}
                    signal={p.signal}
                    score={p.score}
                    reasons={p.reasons}
                    compact
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">
                Nothing matched this week. Try adding more sectors or geographies, or keep going:
                your radar will catch the next one.
              </p>
            )}
          </div>
        )}
        {step === 4 && (
          <div className="grid max-w-lg gap-6">
            <label className="flex items-start gap-3 rounded-xl border border-line bg-card p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#e8551e]"
                checked={!!draft.instant_alerts_enabled && props.canInstant}
                disabled={!props.canInstant}
                onChange={(e) => set({ instant_alerts_enabled: e.target.checked })}
              />
              <span>
                <span className="block font-semibold">Instant alerts</span>
                <span className="text-sm text-muted">
                  For the strongest signals, at most one email every 15 minutes and 5 a day.
                  {!props.canInstant ? " Pro feature." : ""}
                </span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="freq">Digest</Label>
                <Select
                  id="freq"
                  value={draft.digest_frequency}
                  onChange={(e) =>
                    set({ digest_frequency: e.target.value as Draft["digest_frequency"] })
                  }
                >
                  {props.canDaily ? <option value="daily">Daily</option> : null}
                  <option value="weekly">Weekly (Mondays)</option>
                  <option value="off">Off</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="hour">Delivery time</Label>
                <Select
                  id="hour"
                  value={draft.digest_hour_local}
                  onChange={(e) => set({ digest_hour_local: Number(e.target.value) })}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="tz">Timezone (auto-detected)</Label>
              <Select
                id="tz"
                value={draft.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
              >
                {(zones.includes(draft.timezone!) ? zones : [draft.timezone!, ...zones]).map(
                  (z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ),
                )}
              </Select>
            </div>
            {error ? <p className="text-sm text-accent">{error}</p> : null}
          </div>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
        >
          Back
        </Button>
        {step < STEP_TITLES.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || pending}>
            {step === 2 && !(draft.watchlist_companies ?? []).length ? "Skip for now" : "Continue"}
          </Button>
        ) : (
          <Button
            variant="accent"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await completeOnboarding(draft);
                if (res?.error) setError(res.error);
              })
            }
          >
            {pending ? "Saving..." : "Start my radar"}
          </Button>
        )}
      </div>
    </div>
  );
}
