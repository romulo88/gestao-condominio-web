"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ANEXO_DEMANDA_ACCEPT, ehVideo, separarAnexosDemandaValidos } from "@/lib/imagem-upload";
import { IconePlay } from "@/components/icons";

type Props = {
  arquivos: File[];
  onChange: (arquivos: File[]) => void;
};

/** Seleção de imagem/vídeo ANTES da demanda existir de verdade - fica só no navegador
 * (thumbs via `URL.createObjectURL`) até o "Cadastrar" ser clicado, quando cada arquivo
 * sobe pra API um por um, já com o id da demanda recém-criada (ver `handleCriar` de cada
 * tela). Filtra tipo/tamanho aqui só pra dar erro cedo sem gastar uma chamada - o backend
 * confere tudo de novo (`DemandaDocumentoService`), então isso aqui não é a única defesa. */
export function UploadImagens({ arquivos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  const previews = useMemo(() => arquivos.map((arquivo) => URL.createObjectURL(arquivo)), [arquivos]);
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  function handleSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const selecionados = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois de remover

    const { validos, rejeitados } = separarAnexosDemandaValidos(selecionados);
    setErro(rejeitados.length > 0 ? `Ignorado: ${rejeitados.join(", ")}` : null);
    if (validos.length > 0) onChange([...arquivos, ...validos]);
  }

  function remover(indice: number) {
    onChange(arquivos.filter((_, i) => i !== indice));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {arquivos.map((arquivo, i) => (
          <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200">
            {ehVideo(arquivo) ? (
              <>
                <video src={previews[i]} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <IconePlay className="pointer-events-none absolute inset-0 m-auto h-6 w-6 text-white" />
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- preview local via blob:, next/image não serve pra isso
              <img src={previews[i]} alt={arquivo.name} className="h-full w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => remover(i)}
              title="Remover"
              className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md bg-slate-900/70 text-xs text-white hover:bg-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title="Adicionar imagem ou vídeo"
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-2xl text-slate-400 hover:border-blue-400 hover:text-blue-500"
        >
          +
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ANEXO_DEMANDA_ACCEPT}
          multiple
          onChange={handleSelecionar}
          className="hidden"
        />
      </div>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
