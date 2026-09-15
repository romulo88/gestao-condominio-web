import { ImageResponse } from "next/og";
import { CasaIconElement } from "@/lib/pwa-icon";

/** Ícone pro "Adicionar à Tela de Início" do Safari/iOS (pedido do Romulo, corrigindo a
 * v119 - testando no iPhone de verdade, o ícone salvo veio um "C" genérico, fallback do
 * próprio Safari a partir do título da página). O Safari NÃO usa os ícones do
 * `manifest.ts` (isso é só pra Android/Chrome) - ele só respeita `<link
 * rel="apple-touch-icon">`, que essa convenção de arquivo (`apple-icon`) gera sozinha.
 * 180x180 é o tamanho recomendado atual da Apple pro ícone de tela de início (o iOS reduz
 * sozinho pros tamanhos menores em modelos mais antigos). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<CasaIconElement size={180} />, size);
}
