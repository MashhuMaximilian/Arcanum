import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Magra, Teko } from "next/font/google";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { SiteShell } from "@/components/site-shell";

import "./globals.css";

const displayFont = Teko({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-teko",
  display: "swap",
});

const uiFont = Magra({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-magra",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arcanum",
  description: "Aurora web character builder scaffold",
  icons: {
    icon: "/favicon.ico",
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${displayFont.variable} ${uiFont.variable}`}>
      <body suppressHydrationWarning>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
