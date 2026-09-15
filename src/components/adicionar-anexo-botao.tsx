"use client";

import { ReactNode, useRef, useState } from "react";
import { ANEXO_DEMANDA_ACCEPT, separarAnexosDemandaValidos } from "@/lib/imagem-upload";

const BOTAO_CLASSE_PADRAO =
  "flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-2xl text-slate-400 hover:border-blue-400 hover:text-blue-500 disabled:opacity-50";

type Props = {
  onEnviar: (arquivo: File) => Promise<void>;
  titulo?: string;
  /** Sobrescreve o visual padrão (tile "+" tracejado) - ex: o ícone de upload do card do
   * Kanban. O clique/seletor de arquivo continua todo dentro deste componente (nunca
   * exposto pra fora como função) - só o conteúdo visual do botão é customizável. */
  className?: string;
  children?: (estado: { enviando: boolean }) => ReactNode;
};

/** Abre o seletor de arquivo e sobe CADA imagem/vídeo na hora - diferente de
 * `UploadImagens` (que só junta arquivo pra subir depois, quando o formulário maior for
 * salvo): aqui a demanda já existe de verdade, então não tem por que esperar. Usado pra
 * anexar mais imagem/vídeo numa demanda já cadastrada, direto na listagem de `/demandas`
 * ou no ícone do card do Kanban. Mesma validação de tipo/tamanho no cliente que
 * `UploadImagens` - o limite de QUANTIDADE (3 fotos, 1 vídeo) só o backend confere, já
 * que é quem sabe o que a demanda já tem de verdade; a mensagem de erro dele chega pronta
 * no `erro` abaixo. */
export function AdicionarAnexoBotao({ onEnviar, titulo = "Adicionar imagem ou vídeo", className, children }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const selecionados = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois

    const { validos, rejeitados } = separarAnexosDemandaValidos(selecionados);
    if (validos.length === 0) {
      setErro(rejeitados.length > 0 ? `Ignorado: ${rejeitados.join(", ")}` : null);
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      for (const arquivo of validos) {
        await onEnviar(arquivo);
      }
      if (rejeitados.length > 0) setErro(`Ignorado: ${rejeitados.join(", ")}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar imagem.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        draggable={false}
        onClick={() => inputRef.current?.click()}
        disabled={enviando}
        title={titulo}
        className={className ?? BOTAO_CLASSE_PADRAO}
      >
        {children ? children({ enviando }) : enviando ? "…" : "+"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ANEXO_DEMANDA_ACCEPT}
        multiple
        onChange={handleSelecionar}
        className="hidden"
      />
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
