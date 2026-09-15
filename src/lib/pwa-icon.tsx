/** Elemento reaproveitado pelos dois geradores de ícone do PWA - `pwa-icon/[size]` (Android/
 * Chrome, referenciado pelo `manifest.ts`) e `apple-icon.tsx` (Safari/iOS, que ignora o
 * manifest e só usa a convenção de arquivo `apple-icon`). Mesma casinha do cabeçalho/login
 * (`IconeCasa`) num fundo azul-marinho sólido - só o tamanho muda entre os dois. */
export function CasaIconElement({ size }: { size: number }) {
  const casaSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#93c5fd"><path d="M4 21V9l8-6 8 6v12h-6v-7h-4v7H4z"/></svg>';
  const casaDataUri = `data:image/svg+xml,${encodeURIComponent(casaSvg)}`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse (Satori) não usa next/image */}
      <img src={casaDataUri} width={size * 0.56} height={size * 0.56} alt="" />
    </div>
  );
}
