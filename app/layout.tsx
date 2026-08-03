import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taktik Automat",
  description: "A focused workspace for textbook publishing.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
