import type { Metadata, Viewport } from "next";
import { Geist_Mono, Montserrat, Nunito } from "next/font/google";

import { ClientProviders } from "@/components/providers/client-providers";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

/** Tipografia da marca Alle (logo “alle” — geométrica, sem arredondamento). */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alle One",
  description: "Portal Alle One",
  applicationName: "Alle One",
  appleWebApp: {
    capable: true,
    title: "Alle One",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon", type: "image/png", sizes: "32x32" },
      { url: "/icon-192", type: "image/png", sizes: "192x192" },
      { url: "/icon-512", type: "image/png", sizes: "512x512" },
      { url: "/alle-simbolo.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/alle-simbolo.png",
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#08182f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${nunito.variable} ${montserrat.variable} ${geistMono.variable} font-sans antialiased`}
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