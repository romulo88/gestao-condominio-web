"use client";

import { useEffect, useRef, useState } from "react";
import {
  buscarRonda,
  buscarRondaAtiva,
  enviarPontosRonda,
  finalizarRonda,
  iniciarRonda,
  RONDA_OBSERVACAO_MAX,
  RondaPontoRequest,
  RondaResponse,
  TIPO_RONDA_LABEL,
  TipoRonda,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { renovarSessaoSeVelha } from "@/lib/use-renovacao-sessao";
import { AppShell } from "@/components/app-shell";
import { FormNovaDemanda } from "@/components/form-nova-demanda";
import { MapaRonda } from "@/components/mapa-ronda";
import { Button } from "@/components/ui";

/** A cada quantos ms o buffer de pontos é enviado ao backend em lote - tolera sinal ruim
 * na moto (não manda um a um). */
const INTERVALO_ENVIO_PONTOS_MS = 20_000;

type StatusGps = "aguardando" | "ativo" | "sem_sinal" | "pausado";

type Ponto = { latitude: number; longitude: number; capturadoEm?: string };

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (tipo: "release", ouvinte: () => void) => void;
};

/** Distância em metros por Haversine - mesma fórmula do backend (`RondaService`), só que
 * aqui é uma ESTIMATIVA ao vivo (o valor oficial fica gravado no backend ao finalizar). */
function somarDistanciaMetros(pontos: Ponto[]): number {
  const raioTerraMetros = 6_371_000;
  let total = 0;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const deltaLatRad = ((b.latitude - a.latitude) * Math.PI) / 180;
    const deltaLonRad = ((b.longitude - a.longitude) * Math.PI) / 180;
    const haversine =
      Math.sin(deltaLatRad / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(deltaLonRad / 2) ** 2;
    total += raioTerraMetros * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }
  return total;
}

function formatarDuracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  const par = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${par(h)}:${par(m)}:${par(s)}` : `${par(m)}:${par(s)}`;
}

function formatarDistancia(metros: number): string {
  return metros >= 1000 ? `${(metros / 1000).toFixed(2)} km` : `${Math.round(metros)} m`;
}

/**
 * Tela do rondista (feature "Controle de Rondas", pedido do Romulo) - pensada pra uso na
 * moto, celular no suporte do guidão, com luva: botões grandes, uma ação por tela. A ronda
 * é "livre" - o sistema só registra o que aconteceu (início/fim, trajeto, demandas
 * abertas), sem pontos de controle nem rota cadastrada.
 *
 * GPS: `navigator.geolocation.watchPosition` alimenta um buffer local (`pontosPendentesRef`)
 * que é esvaziado em lote a cada {@link INTERVALO_ENVIO_PONTOS_MS} - tolera sinal ruim,
 * mantém no buffer se o envio falhar. "Nova demanda" abre o formulário já existente
 * (`FormNovaDemanda`) num modal por cima, sem interromper a gravação do GPS.
 */
export default function RondaPage() {
  const sessao = useSessaoObrigatoria();
  const ehRondista = sessao?.tipoPapel === "funcionario" && sessao.perfil === "rondista";

  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [rondaAtiva, setRondaAtiva] = useState<RondaResponse | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [statusGps, setStatusGps] = useState<StatusGps>("aguardando");
  const [tempoDecorrido, setTempoDecorrido] = useState(0);
  const [pontosTrajeto, setPontosTrajeto] = useState<Ponto[]>([]);
  const [distanciaEstimada, setDistanciaEstimada] = useState(0);
  const [modalNovaDemandaAberto, setModalNovaDemandaAberto] = useState(false);
  // Modal do "Finalizar ronda" (pedido do Romulo): o rondista é obrigado a escolher o tipo
  // (`""` = "Selecione") e pode escrever uma observação curta antes de encerrar.
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false);
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoRonda | "">("");
  const [observacao, setObservacao] = useState("");
  const [erroFinalizar, setErroFinalizar] = useState<string | null>(null);
  const [wakeLockAtivo, setWakeLockAtivo] = useState(false);
  const [avisoPausaMin, setAvisoPausaMin] = useState<number | null>(null);

  const pontosPendentesRef = useRef<RondaPontoRequest[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const ocultaDesdeRef = useRef<number | null>(null);

  async function flushPontos(rondaId: number) {
    if (!sessao || pontosPendentesRef.current.length === 0) return;
    const lote = pontosPendentesRef.current;
    pontosPendentesRef.current = [];
    try {
      await enviarPontosRonda(sessao.token, rondaId, lote);
      // Ronda em andamento mantém a sessão viva (pedido do Romulo): o rondista caminhando,
      // com a tela parada, não gera clique nem toque - mas está trabalhando. Só conta o envio
      // que deu certo (se o token já tivesse vencido, o envio acima teria falhado).
      void renovarSessaoSeVelha();
    } catch {
      // Sinal ruim na moto - mantém no buffer pra tentar de novo no próximo ciclo (ou no
      // flush final de "Finalizar ronda").
      pontosPendentesRef.current = [...lote, ...pontosPendentesRef.current];
    }
  }

  /** Mantém a tela ligada (best-effort - nem todo navegador suporta). O navegador SOLTA o
   * bloqueio sozinho toda vez que a página sai de foco (app em segundo plano/tela
   * bloqueada) e não devolve ao voltar - por isso é chamado de novo em cada
   * `visibilitychange` pra visível (achado do Romulo: rastro perdido com tela apagada). */
  async function requestWakeLock() {
    if (wakeLockRef.current) return;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (tipo: "screen") => Promise<WakeLockSentinelLike> } };
      const sentinela = await nav.wakeLock?.request("screen");
      if (!sentinela) return;
      wakeLockRef.current = sentinela;
      setWakeLockAtivo(true);
      sentinela.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeLockAtivo(false);
      });
    } catch {
      setWakeLockAtivo(false);
    }
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setWakeLockAtivo(false);
  }

  function aoNovaPosicao(posicao: GeolocationPosition) {
    if (!document.hidden) setStatusGps("ativo");
    const ponto: RondaPontoRequest = {
      latitude: posicao.coords.latitude,
      longitude: posicao.coords.longitude,
      capturadoEm: new Date().toISOString(),
    };
    pontosPendentesRef.current.push(ponto);
    setPontosTrajeto((atual) => {
      const novo = [...atual, ponto];
      setDistanciaEstimada(somarDistanciaMetros(novo));
      return novo;
    });
  }

  function comecarRastreamento(rondaId: number) {
    requestWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      aoNovaPosicao,
      () => setStatusGps("sem_sinal"),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    flushIntervalRef.current = setInterval(() => flushPontos(rondaId), INTERVALO_ENVIO_PONTOS_MS);
  }

  function pararRastreamento() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
    releaseWakeLock();
    setStatusGps("aguardando");
  }

  // Retoma a ronda em andamento (se houver) ao abrir a tela - recarregar a página no meio
  // da ronda não perde o estado. Busca o detalhe (com os pontos já gravados) pra não
  // reiniciar o trajeto do zero no mapa.
  useEffect(() => {
    if (!sessao || !ehRondista) return;
    let cancelado = false;
    (async () => {
      try {
        const ativa = await buscarRondaAtiva(sessao.token);
        if (cancelado || !ativa) return;
        const detalhe = await buscarRonda(sessao.token, ativa.id);
        if (cancelado) return;
        setRondaAtiva(ativa);
        const pontos = detalhe.pontos.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          capturadoEm: p.capturadoEm,
        }));
        setPontosTrajeto(pontos);
        setDistanciaEstimada(somarDistanciaMetros(pontos));
        comecarRastreamento(ativa.id);
      } finally {
        if (!cancelado) setCarregandoInicial(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, ehRondista]);

  // Tempo decorrido, atualizado a cada segundo enquanto a ronda estiver ativa.
  useEffect(() => {
    if (!rondaAtiva) return;
    const inicio = new Date(rondaAtiva.iniciadaEm).getTime();
    const atualizar = () => setTempoDecorrido(Math.max(0, Math.floor((Date.now() - inicio) / 1000)));
    atualizar();
    const id = setInterval(atualizar, 1000);
    return () => clearInterval(id);
  }, [rondaAtiva]);

  // Tela bloqueada/app em segundo plano: o navegador suspende o JavaScript e o GPS da
  // página (sem como contornar na web - achado do Romulo, rastro em linha reta com a tela
  // apagada). O que dá pra fazer: avisar ("pausado"), tentar mandar o que já estava no
  // buffer, e ao VOLTAR pedir a tela ligada de novo (o bloqueio de tela é solto sozinho ao
  // sair de foco), uma posição nova na hora e mandar o buffer sem esperar o próximo ciclo.
  useEffect(() => {
    if (!rondaAtiva) return;
    const rondaId = rondaAtiva.id;
    function aoMudarVisibilidade() {
      if (document.hidden) {
        ocultaDesdeRef.current = Date.now();
        setStatusGps("pausado");
        flushPontos(rondaId);
        return;
      }
      const desde = ocultaDesdeRef.current;
      ocultaDesdeRef.current = null;
      if (desde && Date.now() - desde > 10_000) {
        setAvisoPausaMin(Math.max(1, Math.round((Date.now() - desde) / 60_000)));
      }
      setStatusGps("aguardando");
      requestWakeLock();
      navigator.geolocation.getCurrentPosition(aoNovaPosicao, () => setStatusGps("sem_sinal"), {
        enableHighAccuracy: true,
        timeout: 15_000,
      });
      flushPontos(rondaId);
    }
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rondaAtiva, sessao?.token]);

  // Limpeza ao sair da tela sem finalizar (navegou pra outro lugar) - a ronda continua
  // em_andamento no backend, só para de gravar pontos localmente aqui.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => pararRastreamento(), []);

  async function handleIniciar() {
    if (!sessao) return;
    setErro(null);
    setIniciando(true);
    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Este navegador não suporta geolocalização."));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 });
      });
    } catch {
      setErro("Não foi possível acessar sua localização - permita o acesso à localização do navegador para iniciar a ronda.");
      setIniciando(false);
      return;
    }
    try {
      const nova = await iniciarRonda(sessao.token);
      setRondaAtiva(nova);
      setPontosTrajeto([]);
      setDistanciaEstimada(0);
      comecarRastreamento(nova.id);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao iniciar a ronda.");
    } finally {
      setIniciando(false);
    }
  }

  function abrirModalFinalizar() {
    setTipoEscolhido("");
    setObservacao("");
    setErroFinalizar(null);
    setModalFinalizarAberto(true);
  }

  async function handleConfirmarFinalizacao() {
    if (!rondaAtiva || !sessao) return;
    if (!tipoEscolhido) {
      setErroFinalizar("Selecione o tipo da ronda.");
      return;
    }
    setErroFinalizar(null);
    setFinalizando(true);
    try {
      await flushPontos(rondaAtiva.id);
      await finalizarRonda(sessao.token, rondaAtiva.id, { tipo: tipoEscolhido, observacao: observacao.trim() || undefined });
      pararRastreamento();
      setModalFinalizarAberto(false);
      setRondaAtiva(null);
      setPontosTrajeto([]);
      setTempoDecorrido(0);
    } catch (err) {
      setErroFinalizar(err instanceof Error ? err.message : "Falha ao finalizar a ronda.");
    } finally {
      setFinalizando(false);
    }
  }

  if (!sessao) return null;

  if (!ehRondista) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">Só rondista tem acesso a esta tela.</p>
      </AppShell>
    );
  }

  if (carregandoInicial) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">Carregando...</p>
      </AppShell>
    );
  }

  return (
    <AppShell sessao={sessao}>
      {!rondaAtiva ? (
        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Ronda</h1>
          <p className="max-w-sm text-sm text-slate-500">
            Ao iniciar, o sistema vai gravar sua localização durante o trajeto. Mantenha esta tela aberta durante a
            ronda.
          </p>
          <p className="max-w-sm text-xs text-slate-400">
            Dica: deixe o bloqueio automático do celular em &quot;Nunca&quot; e o celular no carregador. Com a tela
            bloqueada o GPS pausa e o trecho fica sem registro.
          </p>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <Button onClick={handleIniciar} disabled={iniciando}>
            {iniciando ? "Iniciando..." : "Iniciar ronda"}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white ${
              statusGps === "ativo"
                ? "bg-emerald-600"
                : statusGps === "sem_sinal"
                  ? "bg-red-600"
                  : statusGps === "pausado"
                    ? "bg-amber-500"
                    : "bg-slate-500"
            }`}
          >
            <span>
              Ronda em andamento — GPS{" "}
              {statusGps === "ativo"
                ? "ativo"
                : statusGps === "sem_sinal"
                  ? "sem sinal"
                  : statusGps === "pausado"
                    ? "pausado"
                    : "aguardando sinal"}
            </span>
            <span className="font-mono text-base">{formatarDuracao(tempoDecorrido)}</span>
          </div>

          {avisoPausaMin !== null && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>
                O GPS ficou pausado por cerca de {avisoPausaMin} min (tela bloqueada ou app em segundo plano). Esse
                trecho fica tracejado no mapa. Mantenha a tela ligada e o app aberto.
              </p>
              <button
                type="button"
                onClick={() => setAvisoPausaMin(null)}
                title="Fechar aviso"
                className="shrink-0 text-amber-600 hover:text-amber-800"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex gap-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Tempo</p>
              <p className="font-mono text-lg">{formatarDuracao(tempoDecorrido)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Distância</p>
              <p className="text-lg">{formatarDistancia(distanciaEstimada)}</p>
            </div>
          </div>

          <MapaRonda pontos={pontosTrajeto} className="h-72 w-full rounded-lg border border-slate-200" />

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => setModalNovaDemandaAberto(true)} className="flex-1">
              + Nova demanda
            </Button>
            <button
              type="button"
              onClick={abrirModalFinalizar}
              className="flex-1 rounded-full bg-red-600 px-6 py-4 text-base font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              Finalizar ronda
            </button>
          </div>

          <div className="space-y-1 text-center text-xs text-slate-400">
            <p>Mantenha esta tela aberta durante a ronda.</p>
            {wakeLockAtivo ? (
              <p>Tela mantida ligada automaticamente. Não bloqueie o celular - com a tela bloqueada o GPS pausa.</p>
            ) : (
              <p className="text-amber-600">
                Não consegui manter a tela ligada automaticamente: deixe o bloqueio automático do celular em
                &quot;Nunca&quot; (e no carregador) e não bloqueie a tela, senão o GPS pausa.
              </p>
            )}
          </div>
        </div>
      )}

      {modalFinalizarAberto && rondaAtiva && (
        // z-[1200] - mesmo motivo do modal de "Nova demanda" logo abaixo (mapa do Leaflet).
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => !finalizando && setModalFinalizarAberto(false)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-slate-700">Finalizar ronda</p>

            <div>
              <label htmlFor="tipo-ronda" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Tipo da ronda
              </label>
              <select
                id="tipo-ronda"
                value={tipoEscolhido}
                onChange={(e) => {
                  setTipoEscolhido(e.target.value as TipoRonda | "");
                  setErroFinalizar(null);
                }}
                className="block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione</option>
                {(Object.keys(TIPO_RONDA_LABEL) as TipoRonda[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {TIPO_RONDA_LABEL[tipo]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="observacao-ronda"
                className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400"
              >
                Observação (opcional)
              </label>
              <textarea
                id="observacao-ronda"
                value={observacao}
                maxLength={RONDA_OBSERVACAO_MAX}
                rows={3}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: Acompanhando entregador até a casa 300"
                className="block w-full resize-none rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-right text-xs text-slate-400">
                {observacao.length}/{RONDA_OBSERVACAO_MAX}
              </p>
            </div>

            {erroFinalizar && <p className="text-sm text-red-600">{erroFinalizar}</p>}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setModalFinalizarAberto(false)} disabled={finalizando}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmarFinalizacao} disabled={finalizando}>
                {finalizando ? "Finalizando..." : "OK"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {modalNovaDemandaAberto && rondaAtiva && (
        // z-[1200] (não o z-50 padrão dos outros modais do projeto) - achado do Romulo
        // testando no celular: os controles internos do Leaflet (zoom +/-, tiles) do MAPA
        // AO VIVO por baixo desta tela usam z-index de até ~1000 (fixo pela própria lib),
        // furando por cima de um overlay z-50 e aparecendo em cima do formulário.
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setModalNovaDemandaAberto(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Nova demanda</p>
              <button
                type="button"
                onClick={() => setModalNovaDemandaAberto(false)}
                title="Fechar"
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <FormNovaDemanda
              sessao={sessao}
              rondaId={rondaAtiva.id}
              aoCriar={() => setModalNovaDemandaAberto(false)}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
