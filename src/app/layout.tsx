import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegistroServiceWorker } from "@/components/registro-service-worker";
import { BASE_PATH } from "@/lib/base-path";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Commander",
  description: "Sistema de gestão de demandas de condomínios",
  // Ícone da tela de início do Safari/iOS (só ele respeita apple-touch-icon; o manifest é
  // pra Android/Chrome). Declarado aqui em vez da convenção `apple-icon.tsx` porque
  // aquela não recebe o prefixo do `basePath` no `<link>` gerado.
  icons: {
    apple: [{ url: `${BASE_PATH}/pwa-icon/180`, sizes: "180x180", type: "image/png" }],
  },
  // PWA (pedido do Romulo, v119) - nome do app instalado no iPhone/Android; ver
  // `manifest.ts` pro manifest de verdade (usado pelo Android/Chrome). `appleWebApp` é
  // meta tag própria do iOS - continua necessária além do manifest pra tela cheia/status
  // bar funcionarem direito no Safari.
  appleWebApp: {
    title: "Commander",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
