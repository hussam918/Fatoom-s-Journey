import type { Metadata } from "next";
import "./globals.css";
import "./fairytale.css";

export const metadata: Metadata = {
  title: "رحلة فاطمة | عالم صغير مليء بالإنجازات",
  description: "مساحة عائلية لمهام فاطمة وإنجازاتها ونجومها ومكافآتها.",
  applicationName: "رحلة فاطمة",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

