export const site = {
  name: "YouTubeコメント分析",
  brand: "余白観察室",
  title: "YouTubeコメント分析 | 余白観察室",
  description: "YouTubeのコメント原文を読みながら、感情の向き・熱量・文体の印象を共通のフィルターで比較できる分析ツールです。",
  locale: "ja_JP",
  language: "ja",
  themeColor: "#065FD4",
  backgroundColor: "#FFFFFF",
  socialImage: {
    path: "/social-card.png",
    width: 1200,
    height: 630,
    alt: "YouTubeコメント分析 — 余白観察室。コメントの原文から、感情の向き・熱量・文体の印象を読み解く。",
  },
} as const;

// 公開先が未定のローカル環境では、仮のcanonicalや共有画像URLを出力しない。
export function getSiteUrl(value = process.env.SITE_URL): URL | undefined {
  if (!value?.trim()) return undefined;

  const message = "SITE_URLにはhttp(s)のオリジンを指定してください（パス・クエリ・認証情報は指定できません）。";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(message);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(message);
  }
  return url;
}
