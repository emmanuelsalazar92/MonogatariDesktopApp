import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private Novel Studio",
  description: "A local network writing studio prototype for private novels."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
