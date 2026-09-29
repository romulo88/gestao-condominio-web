"use client";

import { useEffect, useRef, useState } from "react";
import {
  EventoPessoaResponse,
  EventoResponse,
  ehPerfilRestrito,
  liberarPessoaEvento,
  liberarVeiculoEvento,
  listarPaginaEventos,
  removerFotoPessoaEvento,
  uploadFotoPessoaEvento,
  urlImagem,
} from "@/lib/api";
import { separarImagensValidas } from "@/lib/imagem-upload";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui";

/** Data de hoje no fuso do usuário, yyyy-MM-dd (mesmo formato do backend/`<input type="date">`). */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDe(ano: number, mesZeroBased: number, dia: number): string {
  return `${ano}-${String(mesZeroBased + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Calendário da portaria (feature "Eventos", pedido do Romulo) - perfil `porteiro` ou
 * perfil completo do condomínio. Carrega o mês inteiro de uma vez (baixo volume esperado
 * por condomínio) e filtra o dia clicado só em memória - clicar no calendário não refaz
 * chamada nenhuma. Liberação é por item (pessoa/veículo, não por evento) e é um toggle -
 * clicar de novo desfaz.
 */
export default function PortariaPage() {
  const sessao = useSessaoObrigatoria();
  const ehPorteiro = sessao?.tipoPapel === "funcionario" && sessao.perfil === "porteiro";
  const podeVerPortaria =
    ehPorteiro || (sessao?.tipoPapel === "funcionario" && !ehPerfilRestrito(sessao.perfil));

  const [mesAtual, setMesAtual] = useState(() => new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(hojeISO());
  const [eventosDoMes, setEventosDoMes] = useState<EventoResponse[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [alternandoId, setAlternandoId] = useState<number | null>(null);

  // Modal de foto (pedido do Romulo: registro de segurança opcional, tirada ao conferir o
  // documento - clicar no nome da pessoa abre isso, independente do checkbox de liberar).
  const [fotoModalPessoa, setFotoModalPessoa] = useState<{ eventoId: number; pessoa: EventoPessoaResponse } | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessao || !podeVerPortaria) return;
    let cancelado = false;
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const dataInicio = isoDe(ano, mes, 1);
    const dataFim = isoDe(ano, mes, new Date(ano, mes + 1, 0).getDate());
    listarPaginaEventos(sessao.token, { dataInicio, dataFim, tamanho: 200 })
      .then((pagina) => {
        if (!cancelado) setEventosDoMes(pagina.itens);
      })
      .catch((err) => {
        if (!cancelado) setErro(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, podeVerPortaria, mesAtual]);

  function atualizarEventoLocal(atualizado: EventoResponse) {
    setEventosDoMes((atual) => atual?.map((e) => (e.id === atualizado.id ? atualizado : e)) ?? null);
  }

  async function handleLiberarVeiculo(eventoId: number, veiculoId: number) {
    if (!sessao) return;
    setErro(null);
    setAlternandoId(veiculoId);
    try {
      atualizarEventoLocal(await liberarVeiculoEvento(sessao.token, eventoId, veiculoId));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao liberar.");
    } finally {
      setAlternandoId(null);
    }
  }

  async function handleLiberarPessoa(eventoId: number, pessoaId: number) {
    if (!sessao) return;
    setErro(null);
    setAlternandoId(pessoaId);
    try {
      atualizarEventoLocal(await liberarPessoaEvento(sessao.token, eventoId, pessoaId));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao liberar.");
    } finally {
      setAlternandoId(null);
    }
  }

  function abrirFotoModal(eventoId: number, pessoa: EventoPessoaResponse) {
    setErroFoto(null);
    setFotoModalPessoa({ eventoId, pessoa });
  }

  function fecharFotoModal() {
    setFotoModalPessoa(null);
    setErroFoto(null);
  }

  /** Substitui a pessoa dentro do modal aberto pela versão nova (que veio junto do evento
   * atualizado na resposta) - mantém a prévia da foto em sincronia sem fechar o modal. */
  function atualizarFotoModal(eventoId: number, atualizado: EventoResponse) {
    const pessoaAtualizada = atualizado.pessoas.find((p) => p.id === fotoModalPessoa?.pessoa.id);
    if (pessoaAtualizada) setFotoModalPessoa({ eventoId, pessoa: pessoaAtualizada });
  }

  async function handleSelecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
    if (!arquivo || !sessao || !fotoModalPessoa) return;

    const { validos, rejeitados } = separarImagensValidas([arquivo]);
    if (validos.length === 0) {
      setErroFoto(rejeitados[0] ?? "Arquivo inválido.");
      return;
    }

    setErroFoto(null);
    setEnviandoFoto(true);
    try {
      const atualizado = await uploadFotoPessoaEvento(
        sessao.token,
        fotoModalPessoa.eventoId,
        fotoModalPessoa.pessoa.id,
        arquivo,
      );
      atualizarEventoLocal(atualizado);
      atualizarFotoModal(fotoModalPessoa.eventoId, atualizado);
    } catch (err) {
      setErroFoto(err instanceof Error ? err.message : "Falha ao enviar foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function handleRemoverFoto() {
    if (!sessao || !fotoModalPessoa) return;
    setErroFoto(null);
    setEnviandoFoto(true);
    try {
      const atualizado = await removerFotoPessoaEvento(sessao.token, fotoModalPessoa.eventoId, fotoModalPessoa.pessoa.id);
      atualizarEventoLocal(atualizado);
      atualizarFotoModal(fotoModalPessoa.eventoId, atualizado);
    } catch (err) {
      setErroFoto(err instanceof Error ? err.message : "Falha ao remover foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  if (!sessao) return null;

  if (!podeVerPortaria) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">Só porteiro ou perfil completo tem acesso a esta tela.</p>
      </AppShell>
    );
  }

  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const dias = Array.from({ length: totalDias }, (_, i) => ({ dia: i + 1, iso: isoDe(ano, mes, i + 1) }));
  const hoje = hojeISO();
  const eventosDoDia = eventosDoMes?.filter((e) => e.data === diaSelecionado) ?? [];

  return (
    <AppShell sessao={sessao}>
      <h1 className="text-xl font-semibold text-slate-900">Portaria</h1>
      <p className="mt-1 text-xs text-slate-400">Calendário de eventos cadastrados pelos moradores.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[280px_1fr]">
        <div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMesAtual(new Date(ano, mes - 1, 1))}
              title="Mês anterior"
              className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ‹
            </button>
            <p className="text-sm font-medium capitalize text-slate-900">
              {mesAtual.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              onClick={() => setMesAtual(new Date(ano, mes + 1, 1))}
              title="Próximo mês"
              className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: primeiroDiaSemana }).map((_, i) => (
              <div key={`vazio-${i}`} />
            ))}
            {dias.map(({ dia, iso }) => {
              const temEvento = eventosDoMes?.some((e) => e.data === iso) ?? false;
              const ehSelecionado = iso === diaSelecionado;
              const ehHojeCel = iso === hoje;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setDiaSelecionado(iso)}
                  className={`flex flex-col items-center gap-0.5 rounded-md py-1.5 text-xs ${
                    ehSelecionado
                      ? "border-2 border-blue-500 bg-blue-50 text-slate-900"
                      : ehHojeCel
                        ? "border border-blue-200 bg-white text-slate-900 hover:bg-slate-50"
                        : "border border-transparent bg-white text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>{dia}</span>
                  <span className="flex h-1.5 gap-0.5">
                    {temEvento && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-400">
            Eventos em {formatarDataBR(diaSelecionado)}
            {diaSelecionado === hoje && " (hoje)"}
          </p>
          {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
          {!erro && eventosDoMes === null && <p className="mt-2 text-sm text-slate-500">Carregando...</p>}
          {eventosDoMes !== null && eventosDoDia.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">Nenhum evento nesse dia.</p>
          )}

          <div className="mt-3 space-y-4">
            {eventosDoDia.map((evento) => (
              <div key={evento.id} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">{evento.motivo}</p>
                <p className="text-xs text-slate-500">
                  {evento.moradorNome}
                  {evento.unidade ? ` · Unidade ${evento.unidade}` : ""} · {evento.espacoComumNome ?? "Minha unidade"}
                  {evento.horario ? ` · ${evento.horario}` : ""}
                </p>

                {evento.veiculos.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Veículos</p>
                    <div className="mt-1 space-y-1">
                      {evento.veiculos.map((v) => (
                        <label key={v.id} className="flex items-center gap-2 text-sm text-slate-900">
                          <input
                            type="checkbox"
                            checked={v.liberado}
                            disabled={alternandoId === v.id}
                            onChange={() => handleLiberarVeiculo(evento.id, v.id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className={v.liberado ? "line-through text-slate-400" : ""}>{v.placa}</span>
                          {v.liberado && v.liberadoPorNome && (
                            <span className="text-xs text-slate-400">— liberado por {v.liberadoPorNome}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Pessoas</p>
                  <div className="mt-1 space-y-1">
                    {evento.pessoas.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-sm text-slate-900">
                        <input
                          type="checkbox"
                          checked={p.liberado}
                          disabled={alternandoId === p.id}
                          onChange={() => handleLiberarPessoa(evento.id, p.id)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => abrirFotoModal(evento.id, p)}
                          title="Ver/tirar foto"
                          className={`text-left hover:underline ${p.liberado ? "line-through text-slate-400" : "text-blue-700"}`}
                        >
                          {p.nome} — {p.documento}
                          {p.fotoUrl && <span className="ml-1 text-xs text-emerald-600">(com foto)</span>}
                        </button>
                        {p.liberado && p.liberadoPorNome && (
                          <span className="text-xs text-slate-400">— liberado por {p.liberadoPorNome}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {fotoModalPessoa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharFotoModal}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">{fotoModalPessoa.pessoa.nome}</h2>
              <button type="button" onClick={fecharFotoModal} className="shrink-0 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">{fotoModalPessoa.pessoa.documento}</p>

            <div className="mt-4 flex items-center justify-center overflow-hidden rounded-lg bg-slate-100" style={{ minHeight: 200 }}>
              {fotoModalPessoa.pessoa.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- servido pelo backend com token na query string
                <img
                  src={urlImagem(fotoModalPessoa.pessoa.fotoUrl, sessao.token)}
                  alt={`Foto de ${fotoModalPessoa.pessoa.nome}`}
                  className="max-h-80 w-full object-contain"
                />
              ) : (
                <p className="p-8 text-center text-sm text-slate-400">Sem foto ainda</p>
              )}
            </div>

            {erroFoto && <p className="mt-2 text-sm text-red-600">{erroFoto}</p>}

            <div className="mt-4 flex justify-between gap-2">
              {fotoModalPessoa.pessoa.fotoUrl ? (
                <button
                  type="button"
                  onClick={handleRemoverFoto}
                  disabled={enviandoFoto}
                  className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
                >
                  Remover foto
                </button>
              ) : (
                <span />
              )}
              <Button type="button" onClick={() => fotoInputRef.current?.click()} disabled={enviandoFoto}>
                {enviandoFoto ? "Enviando..." : fotoModalPessoa.pessoa.fotoUrl ? "Trocar foto" : "Tirar foto"}
              </Button>
            </div>

            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleSelecionarFoto}
              className="hidden"
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
