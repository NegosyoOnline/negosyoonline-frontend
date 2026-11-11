import type { Metadata } from "next";

/* The staff app is static HTML in /public, routed by next.config.ts.
   This layout only wraps the framework's own pages, such as the 404. */

export const metadata: Metadata = {
  title: "NegosyoOnline HQ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
