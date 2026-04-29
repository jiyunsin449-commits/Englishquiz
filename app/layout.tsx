import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Quiz Maker",
  description: "이미지 속 영어 텍스트를 분석해 퀴즈를 만들어보세요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-black antialiased">
        {children}
      </body>
    </html>
  );
}
