"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DemandaMudancaStatusResponse, listarMudancasStatus } from "@/lib/api";
import { Sessao } from "@/lib/session";
import { Button } from "@/components/ui";
import { IconeColunas, IconeRaio, IconeRecusar } from "@/components/icons";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mesmo esquema do `SinoTarefas` (sessionStorage, uma vez por token) - chave diferente
 * pra não colidir com o alerta de tarefas. */
function chaveAlertaVisto(token: string): string {
  return `alertaMudancasStatusVisto:${token.slice(-24)}`;
}
function alertaJaVisto(token: string): boolean {
  try {
    return sessionStorage.getItem(chaveAlertaVisto(token)) === "1";
  } catch {
    return false;
  }
}
function marcarAlertaVisto(token: string): void {
  try {
    sessionStorage.setItem(chaveAlertaVisto(token), "1");
  } catch {
    /* sem persistência - no pior caso o alerta reaparece numa próxima tela, tudo bem */
  }
}

function iconePara(tipo: DemandaMudancaStatusResponse["tipo"]) {
  if (tipo === "aprovada") return <IconeRaio className="h-4 w-4" />;
  if (tipo === "reprovada") return <IconeRecusar className="h-4 w-4" />;
  return <IconeColunas className="h-4 w-4" />;
}

/** Cor de cada tipo de evento - pedido do Romulo: mesmo espírito do alerta do
 * `SinoTarefas`, mas sem vermelho (aqui não é urgência, é "o que mudou"). */
function corPara(tipo: DemandaMudancaStatusResponse["tipo"]): string {
  if (tipo === "aprovada") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tipo === "reprovada") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function rotuloPara(e: DemandaMudancaStatusResponse): string {
  if (e.tipo === "aprovada") return "Aprovada";
  if (e.tipo === "reprovada") return "Recusada";
  return `${e.colunaAnteriorNome} → ${e.colunaNovaNome}`;
}

/** Alerta de login do morador (pedido do Romulo): assim que ele loga, se alguma demanda
 * que ele mesmo abriu OU que ele marcou "Acompanhar" (funcionalidade v116 - check numa
 * demanda de outra pessoa, ver `kanban/page.tsx`) mudou de status (aprovada/recusada, ou
 * moveu de coluna no Kanban) desde o login anterior, um modal abre sozinho listando o que
 * aconteceu - mesmo espírito do alerta de tarefas agendadas do `SinoTarefas`
 * (funcionário), só que sem a cor vermelha (aqui não é urgência do dia, é "o que mudou
 * desde a última vez que você entrou"). Aparece uma vez por login (mesmo esquema de
 * `sessionStorage` do `SinoTarefas`), não a cada troca de tela.
 *
 * Sem "desde quando" (primeira vez que a pessoa loga, `ultimoLoginAnterior` null) não tem
 * o que comparar - não busca nada. Sem ícone persistente pra reabrir depois - pedido
 * literal do Romulo foi só o alerta na hora de entrar. */
export function AlertaMudancasStatus({ sessao }: { sessao: Sessao }) {
  const [eventos, setEventos] = useState<DemandaMudancaStatusResponse[] | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (sessao.tipoPapel !== "morador" || !sessao.ultimoLoginAnterior) return;
    if (alertaJaVisto(sessao.token)) return;

    let cancelado = false;
    listarMudancasStatus(sessao.token, sessao.ultimoLoginAnterior)
      .then((lista) => {
        if (cancelado) return;
        marcarAlertaVisto(sessao.token);
        if (lista.length > 0) {
          setEventos(lista);
          setAberto(true);
        }
      })
      .catch(() => {
        // Alerta é um "bônus" no login - falha em buscar não deve travar a navegação
        // normal do morador, nem mostrar erro nenhum na tela.
      });
    return () => {
      cancelado = true;
    };
  }, [sessao.tipoPapel, sessao.ultimoLoginAnterior, sessao.token]);

  if (!aberto || !eventos) return null;

  function fechar() {
    setAberto(false);
  }

  // Pedido do Romulo: se a mesma demanda mudou de status mais de uma vez desde o último
  // acesso, mostra só o evento mais recente dela (não a lista inteira de transições) -
  // diferente do "Histórico de colunas" do Kanban, que é histórico de verdade e mostra
  // tudo. Depois de reduzir, ordena da mais antiga pra mais recente.
  const maisRecentePorDemanda = new Map<number, DemandaMudancaStatusResponse>();
  for (const e of eventos) {
    const atual = maisRecentePorDemanda.get(e.demandaId);
    if (!atual || e.data > atual.data) {
      maisRecentePorDemanda.set(e.demandaId, e);
    }
  }
  const eventosOrdenados = Array.from(maisRecentePorDemanda.values()).sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={fechar}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 text-slate-900 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-start justify-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Novidades nas suas demandas</h2>
          <button
            type="button"
            onClick={fechar}
            className="absolute right-0 top-0 shrink-0 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          Aconteceu isso nas suas demandas desde o seu último acesso.
        </p>

        <div className="mt-3 space-y-2">
          {eventosOrdenados.map((e, i) => (
            <div key={i} className={`rounded-lg border p-3 ${corPara(e.tipo)}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {iconePara(e.tipo)}
                  {rotuloPara(e)}
                </div>
                {/* Funcionalidade "Acompanhar" (pedido do Romulo): distingue demanda
                    própria de demanda de outra pessoa que o morador marcou acompanhar,
                    já que o alerta agora mistura as duas. */}
                {e.origem === "acompanhada" && (
                  <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    Acompanhando
                  </span>
                )}
              </div>
              {/* Pedido do Romulo: título linkado abre o mesmo card do Kanban, no
                  detalhe - `?demanda=<id>` é lido lá em `kanban/page.tsx`. Fecha o
                  alerta antes de navegar (a página nova de qualquer forma desmonta
                  esse componente, mas assim não fica um flash do modal antigo). */}
              <Link
                href={`/kanban?demanda=${e.demandaId}`}
                onClick={fechar}
                className="mt-1 block text-sm font-medium text-blue-600 hover:underline"
              >
                {e.demandaTitulo}
              </Link>
              {e.justificativa && <p className="mt-1 text-sm text-slate-600">{e.justificativa}</p>}
              <p className="mt-1 text-xs text-slate-400">{formatarDataHora(e.data)}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={fechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
