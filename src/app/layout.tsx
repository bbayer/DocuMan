import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuMan — Requirements Management",
  description:
    "AI-powered requirements management system with MIL-STD-498 support, traceability, and version control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
