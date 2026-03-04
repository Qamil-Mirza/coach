import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coach",
  description: "Goal and task coaching with proactive check-ins"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-body">{children}</body>
    </html>
  );
}
