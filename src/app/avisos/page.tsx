"use client";

import { useEffect, useMemo, useState } from "react";
import { AvisoResponse, listarAvisosVisiveis } from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell } from "@/components/app-shell";
import { IconeFixado } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { Input } from "@/components/ui";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Pedido do Romulo: destacar o "título" do aviso na listagem - negrito, fonte um pouco
 * maior. Aviso não tem campo de título separado no banco (só `descricao` livre, ver
 * `Aviso.java`) - a primeira linha já funciona como manchete natural na prática (ex.:
 * "Assembleia na próxima quinta, 04/09" seguida dos detalhes), então o destaque é só
 * visual aqui, sobre a mesma string, sem mudar nada no cadastro. */
function primeiraLinha(texto: string): { titulo: string; resto: string } {
  const quebra = texto.indexOf("\n");
  return quebra === -1
    ? { titulo: texto, resto: "" }
    : { titulo: texto.slice(0, quebra), resto: texto.slice(quebra + 1) };
}

/** O "mural" - tela inicial de quem loga como funcionário ou morador (ver
 * `destinoPosLogin`). Só leitura aqui de propósito: redigir/desativar aviso é uma ação
 * de gestão, feita na aba Aviso do cadastro de condomínio (`/condominios`). */
export default function AvisosPage() {
  const sessao = useSessaoObrigatoria();

  const [avisos, setAvisos] = useState<AvisoResponse[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!sessao) return;
    listarAvisosVisiveis(sessao.token)
      .then(setAvisos)
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar."));
  }, [sessao]);

  const avisosFiltrados = useMemo(() => {
    if (!avisos) return avisos;
    const buscaTexto = busca.trim().toLowerCase();
    if (!buscaTexto) return avisos;
    return avisos.filter(
      (a) => a.descricao.toLowerCase().includes(buscaTexto) || a.funcionarioNome.toLowerCase().includes(buscaTexto),
    );
  }, [avisos, busca]);

  if (!sessao) return null;

  return (
    <AppShell sessao={sessao}>
      <h1 className="text-center text-xl font-semibold text-slate-900">
        Quadro de avisos{sessao.condominioNome ? ` — ${sessao.condominioNome}` : ""}
      </h1>

      <Input
        placeholder="Pesquisar"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mt-4"
      />

      <div className="mt-4 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          Avisos
        </div>

        {erro && <p className="p-5 text-sm text-red-600">{erro}</p>}
        {avisos === null && !erro && <p className="p-5 text-sm text-slate-500">Carregando...</p>}
        {avisos?.length === 0 && <p className="p-5 text-sm text-slate-500">Nenhum aviso no momento.</p>}
        {avisos && avisos.length > 0 && avisosFiltrados?.length === 0 && (
          <p className="p-5 text-sm text-slate-500">Nenhum aviso bate com essa busca.</p>
        )}

        {avisosFiltrados && avisosFiltrados.length > 0 && (
          <div className="divide-y divide-slate-100">
            {avisosFiltrados.map((a) => {
              const { titulo, resto } = primeiraLinha(a.descricao);
              return (
                <div key={a.id} className={a.fixadoNoTopo ? "bg-amber-50 p-5" : "p-5"}>
                  <div className="flex items-start gap-2">
                    {a.fixadoNoTopo && (
                      <span title="Fixado no topo">
                        <IconeFixado className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
                      </span>
                    )}
                    <Markdown texto={titulo} className="text-base font-bold text-slate-900" />
                  </div>
                  {resto.trim() !== "" && <Markdown texto={resto} className="mt-1 text-sm text-slate-900" />}
                  <p className="mt-2 text-xs italic text-slate-400">
                    Publicado por {a.funcionarioNome} em {formatarDataHora(a.createdAt)}
                  </p>
                  {a.dataExpiracao && (
                    <p className="text-xs italic text-slate-400">Válido até {formatarData(a.dataExpiracao)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
