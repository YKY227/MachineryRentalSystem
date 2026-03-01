// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { DriverIdentityProvider } from "@/lib/use-driver-identity";

export const metadata: Metadata = {
  title: "Courier Management System",
  description: "Same-day and multi-stop courier booking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DriverIdentityProvider>
          {children}
        </DriverIdentityProvider>
        </body>
    </html>
  );
}
