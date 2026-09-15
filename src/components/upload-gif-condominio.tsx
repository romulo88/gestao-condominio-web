"use client";

import { useRef, useState } from "react";
import { urlImagem } from "@/lib/api";

// Mesmo limite já usado nos outros uploads do sistema (foto de perfil, anexo de demanda).
const TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8MB

type Props = {
  gifUrl: string | null;
  /** Precisa pra montar a URL de exibição (`gifUrl` é só o caminho, sem token - ver `urlImagem`). */
  token: string;
  onEnviar: (arquivo: File) => Promise<void>;
  onRemover: () => Promise<void>;
};

/** GIF opcional do condomínio (pedido do Romulo) - exibido no lugar do título da página
 * no Kanban quando cadastrado (ver `kanban/page.tsx`). Diferente de `UploadFotoPerfil`
 * (que aceita jpeg/png/webp/gif pra um avatar circular), esse campo é especificamente
 * pra GIF - preview retangular, sem fallback de iniciais (não tem "iniciais" de GIF). */
export function UploadGifCondominio({ gifUrl, token, onEnviar, onRemover }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!arquivo) return;

    if (arquivo.type !== "image/gif") {
      setErro("Só arquivo GIF é aceito aqui.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      setErro("Arquivo maior que 8MB.");
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      await onEnviar(arquivo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar GIF.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleRemover() {
    setErro(null);
    setEnviando(true);
    try {
      await onRemover();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao remover GIF.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <label className="text-xs text-slate-500">GIF (opcional) — aparece no lugar do título da página no Kanban</label>
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          title="Trocar GIF"
          className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 text-lg text-slate-400 hover:border-blue-400 disabled:opacity-50"
        >
          {gifUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- é GIF animado, next/image não anima; servido pelo backend com token na query string
            <img src={urlImagem(gifUrl, token)} alt="GIF do condomínio" className="h-full w-full object-cover" />
          ) : (
            "+"
          )}
        </button>
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
          >
            {enviando ? "Enviando..." : gifUrl ? "Trocar GIF" : "Adicionar GIF"}
          </button>
          {gifUrl && (
            <button
              type="button"
              onClick={handleRemover}
              disabled={enviando}
              className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
            >
              Remover
            </button>
          )}
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/gif" onChange={handleSelecionar} className="hidden" />
    </div>
  );
}
