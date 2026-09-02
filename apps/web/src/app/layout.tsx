import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portego — conversational home",
  description: "Design, bind, and control your home through one conversation.",
  icons: { icon: "/icon.svg" },
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
