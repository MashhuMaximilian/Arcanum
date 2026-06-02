import type { ReactNode } from "react";
import type { Metadata } from "next";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { SiteShell } from "@/components/site-shell";

import "./globals.css";

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
    <html lang="en">
      <body suppressHydrationWarning>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
