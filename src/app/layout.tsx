import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import { getPlatformSettings } from "@/lib/platform-settings";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#16a34a",
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettings();
  /** Green app mark (logo on #16a34a) — bump ?v= when regenerating icons */
  const appIcon = "/icons/icon-192.png?v=20260813";
  const appIconLg = "/icons/icon-512.png?v=20260813";
  const appleIcon = "/icons/apple-touch-icon.png?v=20260813";
  return {
    title: settings.siteTitle,
    description: settings.siteDescription ?? undefined,
    applicationName: "SkillSale",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "SkillSale",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: appIcon, sizes: "192x192", type: "image/png" },
        { url: appIconLg, sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: appleIcon, sizes: "180x180", type: "image/png" },
        { url: appIcon, sizes: "192x192", type: "image/png" },
      ],
      shortcut: [{ url: appIcon }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
