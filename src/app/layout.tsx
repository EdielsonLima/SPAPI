import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || "Empresa";
const companySubtitle = process.env.NEXT_PUBLIC_COMPANY_SUBTITLE || "Sistema de Gestao";

export const metadata: Metadata = {
  title: `${companyName} - ${companySubtitle}`,
  description: `${companySubtitle} da construtora ${companyName}`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
