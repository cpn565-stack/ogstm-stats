import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OGSTM Stats | 思考圖表決統計",
  description: "課堂思考圖紅綠勾快速彙整系統",
  metadataBase: new URL("https://stats.ogstm.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full">
      <body className="min-h-full bg-slate-950 text-slate-50 antialiased">
        <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </body>
    </html>
  );
}