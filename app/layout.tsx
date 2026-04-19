import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocFlow — AI 기획 문서 관리",
  description: "붙여넣기만 하면 자동 분류되는 AI 기획 문서 관리 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
