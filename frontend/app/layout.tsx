import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
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
      <body className={`${nunito.variable} ${geistMono.variable} antialiased`}>
        <script
          // Define o tema antes do React hidratar (evita flash).
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('alleone.theme');var theme=(t==='light'||t==='dark')?t:'dark';var root=document.documentElement;if(theme==='dark'){root.classList.add('dark')}else{root.classList.remove('dark')}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}