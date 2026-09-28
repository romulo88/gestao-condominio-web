"use client";

import { useEffect, useState } from "react";
import {
  buscarResumoRondas,
  buscarRonda,
  ehPerfilRestrito,
  finalizarRonda,
  listarPaginaFuncionarios,
  listarPaginaRondas,
  RondaDetalheResponse,
  RondaResponse,
  RondaResumoResponse,
  RONDA_OBSERVACAO_MAX,
  RONDA_STATUS_LABEL,
  TIPO_RONDA_LABEL,
  TipoRonda,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell } from "@/components/app-shell";
import { IconeOlho } from "@/components/icons";
import { MapaRonda } from "@/components/mapa-ronda";
import { Button } from "@/components/ui";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDuracaoSegundos(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}min` : `${m}min`;
}

function formatarDistancia(metros: number | null): string {
  if (metros == null) return "—";
  return metros >= 1000 ? `${(metros / 1000).toFixed(2)} km` : `${Math.round(metros)} m`;
}

function duracaoDaRonda(r: RondaResponse): number {
  const inicio = new Date(r.iniciadaEm).getTime();
  const fim = r.finalizadaEm ? new Date(r.finalizadaEm).getTime() : Date.now();
  return Math.max(0, Math.floor((fim - inicio) / 1000));
}

/** `<input type="datetime-local">` devolve "yyyy-MM-ddTHH:mm" (sem segundos) - o backend
 * espera ISO completo (`@DateTimeFormat(iso = DATE_TIME)`). */
function paraIsoComSegundos(valor: string): string {
  return valor.length === 16 ? `${valor}:00` : valor;
}

/** Meia-noite do dia anterior, no formato que `<input type="datetime-local">` aceita como
 * `value` ("yyyy-MM-ddTHH:mm") - padrão de período pra rondista/morador (pedido do Romulo):
 * cobre virada de turno noturno sem precisar escolher a data manualmente. */
function ontemMeiaNoite(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  em_andamento: "bg-blue-50 text-blue-700",
  finalizada: "bg-emerald-50 text-emerald-700",
  encerrada_manualmente: "bg-amber-50 text-amber-700",
  encerrada_automaticamente: "bg-slate-100 text-slate-600",
};

/**
 * Tela "Rondas" (feature "Controle de Rondas", pedido do Romulo) - histórico de rondas do
 * condomínio, inclusive as em andamento. Três públicos, cada um com um recorte diferente:
 * - **Perfil completo** (síndico/sub-síndico/encarregado/supervisor): vê tudo, filtra por
 *   qualquer rondista (combo), pode encerrar manualmente uma ronda esquecida (ver
 *   `RondaService.finalizar` no backend) - comportamento original da tela.
 * - **Rondista**: vê só as PRÓPRIAS rondas (pedido do Romulo - "apenas suas rondas") - sem
 *   o combo de rondista (não faz sentido escolher, já é implícito) e sem o botão
 *   "Finalizar" (isso já é feito na tela `/ronda`). Período já vem pré-filtrado de ontem
 *   00:00 até agora (sem limite superior), pra já mostrar o turno recente sem precisar
 *   escolher datas - turno noturno atravessa meia-noite, por isso "ontem" e não "hoje".
 * - **Morador**: mesma ideia do rondista (sem combo, mesmo período padrão), mas vê as
 *   rondas de TODOS os rondistas do condomínio (transparência) - sem poder encerrar nada.
 */
export default function RondasPage() {
  const sessao = useSessaoObrigatoria();
  const ehPerfilCompleto = sessao?.tipoPapel === "funcionario" && !ehPerfilRestrito(sessao.perfil);
  const ehRondista = sessao?.tipoPapel === "funcionario" && sessao.perfil === "rondista";
  const ehMorador = sessao?.tipoPapel === "morador";
  const podeVer = ehPerfilCompleto || ehRondista || ehMorador;
  // Combo "Rondista" (escolher qual ver) só faz sentido pra quem pode ver todo mundo E
  // precisa escolher - perfil completo. Rondista já é implícito (só ele mesmo); morador vê
  // todos sem precisar escolher um de cada vez.
  const mostraComboRondista = ehPerfilCompleto;
  // Observação (texto que o rondista escreveu ao finalizar): perfil completo e o próprio
  // rondista (lembrete pra ele). Morador não vê - e por isso também não ganha o filtro por
  // texto da observação (o backend ignora, senão o filtro vazaria o conteúdo).
  const podeVerObservacao = ehPerfilCompleto || ehRondista;

  const [rondistas, setRondistas] = useState<{ funcionarioId: number; nome: string }[]>([]);
  const [filtroFuncionarioId, setFiltroFuncionarioId] = useState("");
  // `null` = "segue o padrão do papel de quem tá logado" (rondista/morador: ontem 00:00,
  // perfil completo: sem limite) - só vira um valor explícito quando a pessoa mexe no campo.
  // Mesmo truque de `filtroStatus` em `demandas/page.tsx`: `sessao` ainda é `null` no
  // primeiro render (antes da hidratação), então o padrão não pode ser decidido no
  // `useState` inicial nem aplicado por um efeito (setState síncrono em efeito).
  const [filtroInicioEscolhido, setFiltroInicioEscolhido] = useState<string | null>(null);
  const [ontemMeiaNoiteValor] = useState(ontemMeiaNoite);
  const filtroInicio = filtroInicioEscolhido ?? (ehRondista || ehMorador ? ontemMeiaNoiteValor : "");
  const [filtroFim, setFiltroFim] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoRonda | "">("");
  // Nº da ronda e texto da observação são digitados - o que vai pra API é uma cópia
  // "debounced" (só muda 400ms depois da última tecla), pra não bater uma request por tecla
  // (mesmo padrão da busca em `condominios/page.tsx`).
  const [rondaIdDigitado, setRondaIdDigitado] = useState("");
  const [observacaoDigitada, setObservacaoDigitada] = useState("");
  const [rondaIdEfetivo, setRondaIdEfetivo] = useState("");
  const [observacaoEfetiva, setObservacaoEfetiva] = useState("");

  const [resumo, setResumo] = useState<RondaResumoResponse | null>(null);
  const [rondas, setRondas] = useState<RondaResponse[] | null>(null);
  const [pagina, setPagina] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [totalItens, setTotalItens] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [finalizandoId, setFinalizandoId] = useState<number | null>(null);
  const [rondaDetalhe, setRondaDetalhe] = useState<RondaDetalheResponse | null>(null);
  const [observacaoAberta, setObservacaoAberta] = useState<{ rondaId: number; texto: string } | null>(null);

  useEffect(() => {
    if (!sessao || !mostraComboRondista) return;
    listarPaginaFuncionarios(sessao.token, sessao.condominioId!, "", 0, 100)
      .then((p) => setRondistas(p.itens.filter((f) => f.perfil === "rondista").map((f) => ({ funcionarioId: f.funcionarioId, nome: f.nome }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, mostraComboRondista]);

  useEffect(() => {
    const t = setTimeout(() => {
      setRondaIdEfetivo(rondaIdDigitado);
      setObservacaoEfetiva(observacaoDigitada);
      setPagina(0);
    }, 400);
    return () => clearTimeout(t);
  }, [rondaIdDigitado, observacaoDigitada]);

  // Incrementado depois de encerrar uma ronda pra o efeito abaixo recarregar a lista.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!sessao || !podeVer) return;
    let cancelado = false;
    const filtros = {
      funcionarioId: filtroFuncionarioId ? Number(filtroFuncionarioId) : undefined,
      inicio: filtroInicio ? paraIsoComSegundos(filtroInicio) : undefined,
      fim: filtroFim ? paraIsoComSegundos(filtroFim) : undefined,
      tipo: filtroTipo || undefined,
      rondaId: rondaIdEfetivo ? Number(rondaIdEfetivo) : undefined,
      observacao: podeVerObservacao ? observacaoEfetiva : undefined,
    };
    Promise.all([listarPaginaRondas(sessao.token, { ...filtros, pagina }), buscarResumoRondas(sessao.token, filtros)])
      .then(([paginaRondas, resumoPeriodo]) => {
        if (cancelado) return;
        setErro(null);
        setRondas(paginaRondas.itens);
        setTotalPaginas(paginaRondas.totalPaginas);
        setTotalItens(paginaRondas.totalItens);
        setResumo(resumoPeriodo);
      })
      .catch((err) => {
        if (!cancelado) setErro(err instanceof Error ? err.message : "Falha ao carregar as rondas.");
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessao?.token,
    podeVer,
    podeVerObservacao,
    filtroFuncionarioId,
    filtroInicio,
    filtroFim,
    filtroTipo,
    rondaIdEfetivo,
    observacaoEfetiva,
    pagina,
    recarga,
  ]);

  async function handleFinalizar(rondaId: number) {
    if (!sessao) return;
    if (!window.confirm("Encerrar esta ronda? Ela ficou esquecida em andamento pelo rondista.")) return;
    setFinalizandoId(rondaId);
    try {
      await finalizarRonda(sessao.token, rondaId);
      setRecarga((n) => n + 1);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao encerrar a ronda.");
    } finally {
      setFinalizandoId(null);
    }
  }

  async function handleAbrirDetalhe(rondaId: number) {
    if (!sessao) return;
    try {
      setRondaDetalhe(await buscarRonda(sessao.token, rondaId));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao carregar o trajeto.");
    }
  }

  if (!sessao) return null;

  if (!podeVer) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">Você não tem acesso a esta tela.</p>
      </AppShell>
    );
  }

  return (
    <AppShell sessao={sessao}>
      <h1 className="text-center text-xl font-semibold text-slate-900">
        Rondas{sessao.condominioNome ? ` — ${sessao.condominioNome}` : ""}
      </h1>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        {mostraComboRondista && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Rondista</label>
            <select
              value={filtroFuncionarioId}
              onChange={(e) => {
                setFiltroFuncionarioId(e.target.value);
                setPagina(0);
              }}
              className="rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {rondistas.map((r) => (
                <option key={r.funcionarioId} value={r.funcionarioId}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Início</label>
          <input
            type="datetime-local"
            value={filtroInicio}
            onChange={(e) => {
              setFiltroInicioEscolhido(e.target.value);
              setPagina(0);
            }}
            className="rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Fim</label>
          <input
            type="datetime-local"
            value={filtroFim}
            onChange={(e) => {
              setFiltroFim(e.target.value);
              setPagina(0);
            }}
            className="rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Tipo</label>
          <select
            value={filtroTipo}
            onChange={(e) => {
              setFiltroTipo(e.target.value as TipoRonda | "");
              setPagina(0);
            }}
            className="rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {(Object.keys(TIPO_RONDA_LABEL) as TipoRonda[]).map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPO_RONDA_LABEL[tipo]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Nº da ronda</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ex.: 7"
            value={rondaIdDigitado}
            onChange={(e) => setRondaIdDigitado(e.target.value.replace(/\D/g, "").slice(0, 9))}
            className="w-28 rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {podeVerObservacao && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Observação</label>
            <input
              type="text"
              placeholder="Buscar no texto do rondista"
              value={observacaoDigitada}
              maxLength={RONDA_OBSERVACAO_MAX}
              onChange={(e) => setObservacaoDigitada(e.target.value)}
              className="w-64 rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {resumo && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">Rondas</p>
            <p className="text-lg font-semibold text-slate-900">{resumo.totalRondas}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">Tempo total</p>
            <p className="text-lg font-semibold text-slate-900">{formatarDuracaoSegundos(resumo.tempoTotalSegundos)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">Demandas abertas</p>
            <p className="text-lg font-semibold text-slate-900">{resumo.totalDemandas}</p>
          </div>
        </div>
      )}

      {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

      <div className="mt-4 space-y-2">
        {rondas?.map((r) => (
          <div
            key={r.id}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300"
            onClick={() => handleAbrirDetalhe(r.id)}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Pedido do Romulo: `#id` sempre visível (pros 3 públicos) - é como o
                  morador referencia uma ronda específica numa reclamação ("a ronda #7 não
                  passou pelo bloco B"). Nome de quem fez só aparece quando o backend manda
                  (`funcionarioNome` vem `null` pra rondista/morador - só perfil completo
                  vê quem fez, ver `RondaResponse` no backend). */}
              <p className="text-sm font-medium text-slate-900">
                Ronda #{r.id}
                {r.funcionarioNome ? ` — ${r.funcionarioNome}` : ""}
              </p>
              <div className="flex items-center gap-2">
                {/* Ícone pra perfil completo e pro próprio rondista (lembrete pra ele), e só
                    quando ele escreveu algo - o backend já manda `observacao` `null` pro
                    morador (ver `RondaResponse`). */}
                {r.observacao && (
                  <button
                    type="button"
                    title="Ver observação do rondista"
                    onClick={(e) => {
                      e.stopPropagation();
                      setObservacaoAberta({ rondaId: r.id, texto: r.observacao! });
                    }}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <IconeOlho className="h-5 w-5" />
                  </button>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[r.status]}`}>
                  {RONDA_STATUS_LABEL[r.status]}
                </span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Tipo: {r.tipo ? TIPO_RONDA_LABEL[r.tipo] : "—"}</span>
              <span>Início: {formatarDataHora(r.iniciadaEm)}</span>
              <span>Fim: {r.finalizadaEm ? formatarDataHora(r.finalizadaEm) : "—"}</span>
              <span>Duração: {formatarDuracaoSegundos(duracaoDaRonda(r))}</span>
              <span>Distância: {formatarDistancia(r.distanciaMetros)}</span>
              <span>Demandas: {r.totalDemandas}</span>
            </div>
            {r.status === "em_andamento" && ehPerfilCompleto && (
              <div className="mt-2">
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFinalizar(r.id);
                  }}
                  disabled={finalizandoId === r.id}
                >
                  {finalizandoId === r.id ? "Encerrando..." : "Finalizar"}
                </Button>
              </div>
            )}
          </div>
        ))}
        {rondas?.length === 0 && (
          <p className="text-center text-sm text-slate-500">Nenhuma ronda encontrada com esses filtros.</p>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0}>
            Anterior
          </Button>
          <span className="text-sm text-slate-500">
            Página {pagina + 1} de {totalPaginas} · {totalItens} rondas
          </span>
          <Button
            variant="secondary"
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagina >= totalPaginas - 1}
          >
            Próxima
          </Button>
        </div>
      )}

      {observacaoAberta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setObservacaoAberta(null)}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Ronda #{observacaoAberta.rondaId} — observação do rondista</p>
              <button
                type="button"
                onClick={() => setObservacaoAberta(null)}
                title="Fechar"
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{observacaoAberta.texto}</p>
          </div>
        </div>
      )}

      {rondaDetalhe && (
        // z-[1200] - mesmo motivo de app/ronda/page.tsx: os controles internos do Leaflet
        // (zoom +/-) chegam a z-index ~1000, furando um overlay z-50 comum.
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setRondaDetalhe(null)}
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Ronda #{rondaDetalhe.id}
                {rondaDetalhe.funcionarioNome ? ` — ${rondaDetalhe.funcionarioNome}` : ""} —{" "}
                {formatarDataHora(rondaDetalhe.iniciadaEm)} ({Math.floor(duracaoDaRonda(rondaDetalhe) / 60)}min)
              </p>
              <button
                type="button"
                onClick={() => setRondaDetalhe(null)}
                title="Fechar"
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Tipo: {rondaDetalhe.tipo ? TIPO_RONDA_LABEL[rondaDetalhe.tipo] : "—"}
              {rondaDetalhe.observacao ? ` · ${rondaDetalhe.observacao}` : ""}
            </p>
            <MapaRonda pontos={rondaDetalhe.pontos} className="h-72 w-full rounded-lg border border-slate-200" />
            <p className="mt-2 text-xs text-slate-400">
              Trecho tracejado = sem registro de GPS (tela bloqueada ou sem sinal) - a linha reta só liga o último
              ponto antes ao primeiro depois, não é o caminho percorrido.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
