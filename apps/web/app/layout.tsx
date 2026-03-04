import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coach",
  description: "Lightweight todo app with AI check-ins"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
