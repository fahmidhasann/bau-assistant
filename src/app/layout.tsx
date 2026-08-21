import type { Metadata } from "next";
import { Manrope, Noto_Sans_Bengali } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BAU সহকারী — যাচাই করা ক্যাম্পাস তথ্য",
  description:
    "বাংলাদেশ কৃষি বিশ্ববিদ্যালয়ের শিক্ষক, পরিবহন ও জরুরি তথ্যের বাংলা AI সহকারী।",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn" className={`${bengali.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
