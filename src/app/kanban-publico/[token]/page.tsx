"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buscarKanbanPublico, KanbanPublicoResponse } from "@/lib/api";
import { IconeCasa } from "@/components/auth-layout";
import { IconeUpload } from "@/components/icons";

/** Quadro Kanban público - pedido do Romulo: "deixar o kanban disponível em um link
 * externo, independente do usuário estar logado... sem possibilidade de detalhar os
 * cards, mostrando apenas os cards sem sigilo e as raias visíveis". Sem `AppShell` (exige
 * sessão) e sem `useSessaoObrigatoria` de propósito - essa tela nunca faz login, o token
 * na URL É o controle de acesso (ver `KanbanPublicoService` no backend). Card sem
 * `onClick`/`draggable` nenhum - só leitura, sem jeito de abrir detalhe (o backend também
 * nunca manda dado além do necessário pro card em si - ver `CardKanbanPublicoResponse`). */
export default function KanbanPublicoPage() {
  const params = useParams<{ token: string }>();

  const [quadro, setQuadro] = useState<KanbanPublicoResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Segundo+ carregamento (atualizar manual/automático) não precisa mostrar
  // "Carregando..." de novo - só a primeira vez, pra não piscar o quadro inteiro.
  const [carregandoPrimeiraVez, setCarregandoPrimeiraVez] = useState(true);

  function carregar() {
    buscarKanbanPublico(params.token)
      .then((dados) => {
        setQuadro(dados);
        setErro(null);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar."))
      .finally(() => setCarregandoPrimeiraVez(false));
  }

  useEffect(() => {
    carregar();
    // Atualização automática (pedido implícito do caso de uso - link pensado pra ficar
    // aberto num monitor/TV da portaria, não só um clique avulso) - 60s é frequente o
    // suficiente sem gerar carga desnecessária num link 100% público, sem autenticação.
    const intervalo = setInterval(carregar, 60000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-2.5 bg-slate-900 px-6 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <IconeCasa className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium tracking-wide">Commander</span>
        {quadro && (
          <>
            <span className="text-slate-500">·</span>
            <span className="text-sm text-slate-300">Kanban — {quadro.condominioNome}</span>
          </>
        )}
      </header>

      <main className="px-6 py-8">
        {erro && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {erro === "Link não encontrado, revogado, ou nunca existiu"
              ? "Esse link não existe (ou já foi revogado por quem administra o condomínio)."
              : erro}
          </p>
        )}
        {carregandoPrimeiraVez && !erro && <p className="text-sm text-slate-500">Carregando...</p>}

        {quadro && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {quadro.colunas.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma coluna visível cadastrada ainda.</p>
            )}
            {quadro.colunas.map((coluna) => (
              <div key={coluna.id} className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-slate-100">
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{coluna.nome}</p>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
                    {coluna.demandas.length}
                  </span>
                </div>
                <div className="min-h-[3rem] space-y-2 p-2">
                  {coluna.demandas.length === 0 && (
                    <p className="px-1 py-2 text-xs text-slate-400">Nenhuma demanda</p>
                  )}
                  {coluna.demandas.map((d) => (
                    <div key={d.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 text-sm text-slate-800">
                          <span className="mr-1 font-mono text-xs text-slate-400">#{d.id}</span>
                          {d.titulo}
                        </p>
                        {d.temAnexos && (
                          <span title="Tem imagem anexada" className="shrink-0 text-emerald-600">
                            <IconeUpload className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      {d.etiquetas.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.etiquetas.map((et) => (
                            <span
                              key={et.id}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                              style={{ backgroundColor: et.cor }}
                            >
                              {et.descricao}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
