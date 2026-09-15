"use client";

import { useRef, useState } from "react";
import { urlImagem } from "@/lib/api";
import { separarImagensValidas } from "@/lib/imagem-upload";

type Props = {
  fotoUrl: string | null;
  /** Nome da pessoa - usado só pras iniciais do placeholder quando não tem foto. */
  nome?: string;
  /** Precisa pra montar a URL de exibição (`fotoUrl` é só o caminho, sem token - ver `urlImagem`). */
  token: string;
  onEnviar: (arquivo: File) => Promise<void>;
  onRemover: () => Promise<void>;
};

function iniciaisDe(nome: string | undefined): string {
  return (nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

/** Avatar circular com upload/troca/remoção - uma foto só por pessoa (fica em `Pessoa`,
 * não em `Funcionario` - ver `PessoaFotoService`), diferente de `AdicionarAnexoBotao`
 * (que empilha vários anexos numa demanda). Escolher um arquivo novo já sobe e
 * substitui na hora - não fica pendurado esperando o formulário salvar. */
export function UploadFotoPerfil({ fotoUrl, nome, token, onEnviar, onRemover }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!arquivo) return;

    const { validos, rejeitados } = separarImagensValidas([arquivo]);
    if (validos.length === 0) {
      setErro(rejeitados[0] ?? "Arquivo inválido.");
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      await onEnviar(arquivo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar foto.");
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
      setErro(err instanceof Error ? err.message : "Falha ao remover foto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={enviando}
        title="Trocar foto"
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-lg font-medium text-slate-400 hover:border-blue-400 disabled:opacity-50"
      >
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- servido pelo backend com token na query string, next/image não serve pra isso
          <img src={urlImagem(fotoUrl, token)} alt="Foto de perfil" className="h-full w-full object-cover" />
        ) : (
          iniciaisDe(nome) || "?"
        )}
      </button>
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
        >
          {enviando ? "Enviando..." : fotoUrl ? "Trocar foto" : "Adicionar foto"}
        </button>
        {fotoUrl && (
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
      <input ref={inputRef} type="file" accept="image/*" onChange={handleSelecionar} className="hidden" />
    </div>
  );
}
