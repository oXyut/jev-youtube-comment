import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { AppTheme } from "@/components/app-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTubeコメント分析 | 余白観察室",
  description: "YouTubeのコメント原文と感情・文体印象を、共通のフィルターで読み比べます。",
};
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ja"><body><AppRouterCacheProvider><AppTheme>{children}</AppTheme></AppRouterCacheProvider></body></html>;
}
