import "./globals.css";
import type { Metadata } from "next";
import { StoreProvider } from "@/lib/deck-store";

export const metadata: Metadata = {
  title: "Valon SlideGen",
  description: "AI slide drafts and briefings, on brand.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
