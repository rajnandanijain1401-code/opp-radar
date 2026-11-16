import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

const url = process.env.RADAR_PUBLIC_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: "OppRadar: hiring signals before the job is posted",
    template: "%s | OppRadar",
  },
  description:
    "OppRadar watches funding rounds, acquisitions, expansions and leadership hires, scores them for your role, and emails you the ones that mean hiring. Open source.",
  keywords: [
    "job search",
    "startup funding",
    "hiring signals",
    "funding alerts",
    "job alerts",
    "startups India",
  ],
  openGraph: {
    type: "website",
    siteName: "OppRadar",
    title: "Every funding round is a job opening that hasn't been posted yet.",
    description:
      "Funding, acquisitions and hiring signals, scored for you and emailed before the roles go public.",
    url,
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#f4f2ee", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
