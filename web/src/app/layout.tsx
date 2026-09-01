import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getHealth } from "@/lib/dataSource";
import { SHELL } from "@/lib/content";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Providers from "@/components/shell/Providers";
import { PREFERENCES_BOOTSTRAP } from "@/components/shell/Preferences";

const DESCRIPTION =
  "Forecasts how long each animal at the Austin Animal Center will wait for adoption, so staff attention goes where it changes an outcome.";

export const metadata: Metadata = {
  title: { default: "SecondChance", template: "%s · SecondChance" },
  description: DESCRIPTION,
  applicationName: "SecondChance",
  openGraph: {
    title: "SecondChance",
    description: DESCRIPTION,
    siteName: "SecondChance",
    type: "website",
    images: [{ url: "/logo-lockup.png", width: 390, height: 274, alt: "SecondChance" }],
  },
};

/* The browser chrome takes the brand navy in both themes; the mark sits on it
   in the tab strip, so the two should not disagree. These are the only two raw
   hexes outside globals.css and they cannot be anything else — the browser
   reads this before any stylesheet, so a custom property has nothing to
   resolve against. They mirror --brand-navy and --brand-navy-deep; change
   those and change these. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#05274c" },
    { media: "(prefers-color-scheme: dark)", color: "#041d38" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The model version and the data freshness are read once here and rendered in
  // the header on every route, never behind a click.
  const health = await getHealth();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <a
            href="#main"
            className="t-small sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:px-4 focus:py-2"
            style={{ background: "var(--surface-raised)", color: "var(--ink-primary)" }}
          >
            {SHELL.skipLink}
          </a>
          <Header
            modelVersion={health.model_version}
            dataAsOf={health.data_as_of}
            usingFallback={health.using_fallback_data}
          />
          <main id="main" className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-10">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
