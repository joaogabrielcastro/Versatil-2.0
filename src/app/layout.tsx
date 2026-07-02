import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s · ${BRAND.shortName}`,
  },
  description:
    "Gestão da academia — balcão, treinos, presença, cobrança e catraca.",
  applicationName: BRAND.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND.shortName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: BRAND.favicon16, sizes: "16x16", type: "image/png" },
      { url: BRAND.favicon32, sizes: "32x32", type: "image/png" },
      { url: BRAND.icon192, sizes: "192x192", type: "image/png" },
      { url: BRAND.icon512, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: BRAND.appleTouchIcon, sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: BRAND.colors.red,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="light">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
