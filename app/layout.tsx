import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AppTheme } from "@/components/app-theme";
import { getSiteUrl, site } from "@/lib/site";
import "./globals.css";

const siteUrl = getSiteUrl();
const socialImages = siteUrl ? [{
  url: new URL(site.socialImage.path, siteUrl),
  width: site.socialImage.width,
  height: site.socialImage.height,
  alt: site.socialImage.alt,
  type: "image/png",
}] : undefined;

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: site.title, template: `%s | ${site.brand}` },
  description: site.description,
  applicationName: site.name,
  alternates: siteUrl ? { canonical: siteUrl } : undefined,
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.brand,
    title: site.title,
    description: site.description,
    url: siteUrl,
    images: socialImages,
  },
  twitter: {
    card: siteUrl ? "summary_large_image" : "summary",
    title: site.title,
    description: site.description,
    images: socialImages,
  },
  appleWebApp: {
    capable: true,
    title: site.name,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang={site.language}><body><AppRouterCacheProvider><AppTheme>{children}</AppTheme></AppRouterCacheProvider></body></html>;
}
