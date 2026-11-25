import { getSiteUrl } from "@/lib/site";
import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-fira-sans",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-fira-code",
});

export const metadata: Metadata = {
  title: "OGSTM Stats | 思考圖表決統計",
  description: "課堂思考圖紅綠勾快速彙整系統",
  metadataBase: new URL(getSiteUrl()),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`h-full ${firaSans.variable} ${firaCode.variable}`}
    >
      <body className="min-h-full bg-slate-950 text-slate-50 antialiased">
        <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </body>
    </html>
  );
}
