import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse — Observability",
  description: "Metrics, logs, and fleet health (local MVP)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="pulse-page-bg min-h-full flex flex-col font-sans text-zinc-100 antialiased">
        <div className="pulse-main-inner flex min-h-full flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
