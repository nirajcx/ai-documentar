import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { ToastContainer } from "@/components/ToastContainer";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI-Documenter — Intelligent Knowledge & Document Automation",
  description: "AI-Powered Documentation & Document RAG Platform",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only">
          Skip to content
        </a>
        <Providers>
          <ToastContainer />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
