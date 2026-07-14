import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { getSiteSettings } from "@/lib/site-settings";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: settings.siteTitle,
    description: settings.siteDescription ?? undefined,
    ...(settings.faviconUrl
      ? { icons: { icon: settings.faviconUrl } }
      : {}),
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
