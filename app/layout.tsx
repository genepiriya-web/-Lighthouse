import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "./ui/app";

export const metadata: Metadata = { title: "Lighthouse Dispatch", description: "Rental workflow for Lighthouse Film Service" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" />
      </head>
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
