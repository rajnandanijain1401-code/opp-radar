import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { featuresFor } from "@/lib/plan";
import { GEO_OPTIONS, primaryProfile, ROLE_OPTIONS, SECTOR_OPTIONS } from "@/lib/profile";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your radar", robots: { index: false } };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (!user) redirect("/signup");
  const [features, existing] = await Promise.all([featuresFor(user.id), primaryProfile(user.id)]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <OnboardingWizard
        roles={ROLE_OPTIONS}
        sectors={SECTOR_OPTIONS}
        geos={GEO_OPTIONS}
        maxWatchlist={features.maxWatchlist}
        canInstant={features.instant}
        canDaily={features.digestFrequencies.includes("daily")}
        initial={existing?.data}
      />
    </div>
  );
}
