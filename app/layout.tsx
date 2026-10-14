import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AtliQ Review",
  description: "Contract risk review for AtliQ: what a contract means, what it could cost, and what AtliQ already promised.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
