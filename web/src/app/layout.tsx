import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { getShelterView } from "@/lib/shelter.server";
import { SHELL } from "@/lib/content";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Providers from "@/components/shell/Providers";
import PageTransition from "@/components/shell/PageTransition";
import RefreshOnReturn from "@/components/shell/RefreshOnReturn";
import { PREFERENCES_BOOTSTRAP } from "@/components/shell/Preferences";
import { buildQualityRows } from "@/lib/qualityRows";

const DESCRIPTION =
  "Reads the City of Austin's public shelter records and estimates which animals may wait longest, so staff attention goes where it changes an outcome.";

/* Manrope for text, IBM Plex Mono for model versions, dataset IDs and
   timestamps. Both are loaded through next/font, which inlines the font-face
   declarations and reserves metrics up front, so switching from the system
   stack costs no layout shift. `swap` keeps text readable while they load. */
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-loaded",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono-loaded",
});

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

/* The shell revalidates on the same schedule as the view cache
   (VIEW_CACHE_SECONDS in lib/austin/status.ts). Without this
   Next would statically prerender the layout at build time and the header
   would report the freshness of the deployment rather than of the data. */
export const revalidate = 1800;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The data status is read once here and rendered in the header on every
  // route, never behind a click. `cache` makes this free for the pages that
  // ask for the same view again.
  const view = await getShelterView();

  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${plexMono.variable}`}>
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
            status={view.status}
            definitions={view.definitions}
            quality={buildQualityRows(view)}
            unscored={view.unscored}
          />
          <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10">
            <PageTransition>{children}</PageTransition>
          </main>
          <Footer />
          <RefreshOnReturn />
        </Providers>
      </body>
    </html>
  );
}
