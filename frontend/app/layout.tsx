import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";

import { ClientProviders } from "@/components/providers/client-providers";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alle One",
  description: "Portal Alle One",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${nunito.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <script
          // Define o tema antes do React hidratar (evita flash).
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var root=document.documentElement;var t=localStorage.getItem('alleone.theme');var theme=(t==='light'||t==='dark')?t:'dark';if(theme==='dark'){root.classList.add('dark')}else{root.classList.remove('dark')}var c=localStorage.getItem('alleone.sidebar.collapsed');var w=(c==='1')?72:260;root.style.setProperty('--sidebar-width',w+'px');root.dataset.sidebarCollapsed=(c==='1')?'true':'false';}catch(e){}})();`,
          }}
        />
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}