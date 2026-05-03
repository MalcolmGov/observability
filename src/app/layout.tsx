import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./pulse-light.css";
import { ThemeProvider } from "@/components/theme-context";
import { PULSE_THEME_INLINE_SCRIPT } from "@/lib/pulse-theme-script";

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
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="pulse-page-bg min-h-full flex flex-col font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: PULSE_THEME_INLINE_SCRIPT }} />
        <ThemeProvider>
          <a href="#main-content" className="pulse-skip-link">
            Skip to main content
          </a>
          <div className="pulse-main-inner flex min-h-full flex-1 flex-col">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
