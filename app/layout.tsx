import type { Metadata } from "next";
import Script from "next/script";
import { SecretGardenPlayer } from "@/components/secret-garden-player";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { PlatformRuntime } from "@/components/platform-runtime";
import "@/app/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.welinkbtc-onchainmain.xyz"),
  title: {
    default: "welinkBTC — Bitcoin Intelligence Network",
    template: "%s | welinkBTC"
  },
  description:
    "面向研究、链上分析与执行工作流的 Bitcoin Intelligence Network，提供分层会员、Alpha Radar、Dashboard 与 AI Ops。",
  applicationName: "welinkBTC",
  openGraph: {
    type: "website",
    siteName: "welinkBTC",
    title: "welinkBTC — Bitcoin Intelligence Network",
    description: "把比特币市场信号连接到真实执行。",
    images: [{ url: "/og.png", width: 1732, height: 909, alt: "welinkBTC Bitcoin Intelligence Network" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "welinkBTC — Bitcoin Intelligence Network",
    description: "把比特币市场信号连接到真实执行。",
    images: ["/og.png"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/legacy/surf-assistant.css" />
      </head>
      <body>
        <Script id="welinkbtc-theme-init" strategy="beforeInteractive">
          {"try{const d=document.documentElement,t=localStorage.getItem('welinkbtc-theme')==='light'?'light':'dark',l=localStorage.getItem('welinkbtc-language')==='en'?'en':'zh';d.dataset.theme=t;d.dataset.language=l;d.lang=l==='zh'?'zh-CN':'en';d.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.dataset.language='zh'}"}
        </Script>
        {children}
        <PlatformRuntime />
        <AnalyticsTracker />
        <SecretGardenPlayer />
        <Script src="/legacy/surf-assistant.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
