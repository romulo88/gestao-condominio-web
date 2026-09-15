import { ImageResponse } from "next/og";
import { CasaIconElement } from "@/lib/pwa-icon";

/** Ícone do PWA pro manifest (Android/Chrome - ver `../../manifest.ts`; o Safari/iOS ignora
 * isso, usa `../apple-icon.tsx`). Padding generoso (casa ocupa pouco mais da metade do
 * canvas) pra funcionar tanto como ícone comum quanto "maskable" no Android (o sistema pode
 * recortar em círculo/quadrado arredondado sem cortar o desenho) - por isso o mesmo arquivo
 * serve pros dois `purpose` do manifest. Gerado sob demanda via `ImageResponse`; cache forte
 * no header porque o desenho nunca muda pra um tamanho já gerado. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await params;
  const size = Number(sizeParam) === 192 ? 192 : 512;

  return new ImageResponse(<CasaIconElement size={size} />, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
