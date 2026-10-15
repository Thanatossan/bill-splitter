import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_Thai } from "next/font/google";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const thai = Noto_Sans_Thai({ variable: "--font-thai", subsets: ["thai"] });

export const metadata: Metadata = {
  title: "Split the bill",
  description: "Tick what you had, see what you owe.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${thai.variable} antialiased`}>
      <body className="min-h-dvh">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
