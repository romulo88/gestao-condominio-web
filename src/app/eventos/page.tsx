"use client";

import { useEffect, useState } from "react";
import {
  atualizarEvento,
  criarEvento,
  EspacoComumResponse,
  EventoPessoaCandidatoResponse,
  EventoResponse,
  EventoVeiculoCandidatoResponse,
  excluirEvento,
  listarCandidatosPessoasEvento,
  listarCandidatosVeiculosEvento,
  listarEspacosComuns,
  listarMeusEventos,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell } from "@/components/app-shell";
import { IconeLapis, IconeLixeira } from "@/components/icons";
import { Button, Input } from "@/components/ui";

type VeiculoCampos = { id?: number; placa: string; liberado: boolean };
type PessoaCampos = { id?: number; nome: string; documento: string; liberado: boolean };

const FORM_VAZIO = {
  espacoComumId: "",
  motivo: "",
  data: "",
  horario: "",
  reforma: false,
  dataFim: "",
};

/** Dias entre duas datas yyyy-MM-dd (positivo se `fim` é depois de `inicio`). */
function diferencaDias(inicio: string, fim: string): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${fim}T00:00:00`).getTime() - new Date(`${inicio}T00:00:00`).getTime()) / MS_POR_DIA);
}

/** Hoje no fuso do usuário, yyyy-MM-dd - mesmo formato do backend/`<input type="date">`. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Dropdown de sugestões genérico (pedido do Romulo: "visitante recorrente") - não tem
 * input próprio, só a lista; o pai decide o que filtrar (nome de pessoa ou placa de
 * veículo) a partir do valor que JÁ está digitado no campo real. `onMouseDown` com
 * `preventDefault` evita que o campo perca o foco (e dispare o `onBlur` que fecha a
 * lista) antes do `onClick` do item processar - mesmo truque de `ComboDestinatarioMensagemPrivada`. */
function ListaSugestoes<T>({
  aberta,
  sugestoes,
  renderOpcao,
  onSelecionar,
}: {
  aberta: boolean;
  sugestoes: T[];
  renderOpcao: (item: T) => React.ReactNode;
  onSelecionar: (item: T) => void;
}) {
  if (!aberta || sugestoes.length === 0) return null;
  return (
    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
      {sugestoes.map((item, i) => (
        <li key={i}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelecionar(item)}
            className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50"
          >
            {renderOpcao(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function temItemLiberado(evento: EventoResponse): boolean {
  return evento.veiculos.some((v) => v.liberado) || evento.pessoas.some((p) => p.liberado);
}

/** Evento ainda não ocorreu (data de hoje ainda vale). */
function eventoFuturo(evento: EventoResponse): boolean {
  return evento.data >= hojeISO();
}

/** Excluir o evento INTEIRO só antes da data passar e antes de qualquer item já liberado -
 * apagar tudo depois disso destruiria um registro de liberação já feito (mesma regra do
 * backend, `EventoService.exigirDonoEditavel`). Editar não tem mais essa segunda trava -
 * ver `podeEditar`. */
function podeExcluir(evento: EventoResponse): boolean {
  return eventoFuturo(evento) && !temItemLiberado(evento);
}

/**
 * Tela do morador (feature "Eventos", pedido do Romulo) - substitui o aviso por WhatsApp
 * pra portaria: cadastra local, motivo, veículos (placa) e pessoas (nome + documento)
 * esperados, e edita enquanto o evento não ocorreu - o mesmo formulário do cadastro, com
 * cada pessoa/veículo já liberado pela portaria mostrado travado (visualização, sem poder
 * editar aquele item específico). Local e data só podem mudar enquanto a data salva ainda
 * não é hoje (pedido do Romulo: "se a data do evento for igual a hoje, eu não posso mais
 * trocar a data e nem o espaço").
 */
export default function EventosPage() {
  const sessao = useSessaoObrigatoria();
  const ehMorador = sessao?.tipoPapel === "morador";

  const [eventos, setEventos] = useState<EventoResponse[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [espacos, setEspacos] = useState<EspacoComumResponse[] | null>(null);

  // Autocomplete de "visitante recorrente" (pedido do Romulo) - carregado uma vez (igual
  // `espacos`), não a cada abertura do form. `sugestao...Aberta` guarda o ÍNDICE da linha
  // (pessoa/veículo) com o dropdown aberto no momento - só uma por vez.
  const [candidatosPessoas, setCandidatosPessoas] = useState<EventoPessoaCandidatoResponse[] | null>(null);
  const [candidatosVeiculos, setCandidatosVeiculos] = useState<EventoVeiculoCandidatoResponse[] | null>(null);
  const [sugestaoPessoaAberta, setSugestaoPessoaAberta] = useState<number | null>(null);
  const [sugestaoVeiculoAberta, setSugestaoVeiculoAberta] = useState<number | null>(null);

  const [formAberto, setFormAberto] = useState(false);
  const [eventoEditandoId, setEventoEditandoId] = useState<number | null>(null);
  const [dataLocalTravada, setDataLocalTravada] = useState(false);
  const [campos, setCampos] = useState(FORM_VAZIO);
  const [veiculos, setVeiculos] = useState<VeiculoCampos[]>([]);
  const [pessoas, setPessoas] = useState<PessoaCampos[]>([{ nome: "", documento: "", liberado: false }]);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  useEffect(() => {
    if (!sessao || !ehMorador) return;
    let cancelado = false;
    listarMeusEventos(sessao.token)
      .then((lista) => {
        if (!cancelado) setEventos(lista);
      })
      .catch((err) => {
        if (!cancelado) setErroLista(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, ehMorador]);

  useEffect(() => {
    if (!sessao || !ehMorador || !sessao.condominioId) return;
    listarEspacosComuns(sessao.token, sessao.condominioId)
      .then(setEspacos)
      .catch(() => {});
  }, [sessao, ehMorador]);

  useEffect(() => {
    if (!sessao || !ehMorador) return;
    listarCandidatosPessoasEvento(sessao.token).then(setCandidatosPessoas).catch(() => {});
    listarCandidatosVeiculosEvento(sessao.token).then(setCandidatosVeiculos).catch(() => {});
  }, [sessao, ehMorador]);

  function filtrarCandidatosPessoa(busca: string): EventoPessoaCandidatoResponse[] {
    const normalizado = busca.trim().toLowerCase();
    if (!normalizado) return [];
    return (candidatosPessoas ?? []).filter((c) => c.nome.toLowerCase().includes(normalizado)).slice(0, 8);
  }

  function filtrarCandidatosVeiculo(busca: string): EventoVeiculoCandidatoResponse[] {
    const normalizado = busca.trim().toLowerCase();
    if (!normalizado) return [];
    return (candidatosVeiculos ?? []).filter((c) => c.placa.toLowerCase().includes(normalizado)).slice(0, 8);
  }

  function abrirForm() {
    setEventoEditandoId(null);
    setDataLocalTravada(false);
    setCampos(FORM_VAZIO);
    setVeiculos([]);
    setPessoas([{ nome: "", documento: "", liberado: false }]);
    setErroForm(null);
    setFormAberto(true);
  }

  function abrirEdicao(evento: EventoResponse) {
    setEventoEditandoId(evento.id);
    setDataLocalTravada(evento.data === hojeISO());
    setCampos({
      espacoComumId: evento.espacoComumId ? String(evento.espacoComumId) : "",
      motivo: evento.motivo,
      data: evento.data,
      horario: evento.horario ?? "",
      reforma: false,
      dataFim: "",
    });
    setVeiculos(evento.veiculos.map((v) => ({ id: v.id, placa: v.placa, liberado: v.liberado })));
    setPessoas(evento.pessoas.map((p) => ({ id: p.id, nome: p.nome, documento: p.documento, liberado: p.liberado })));
    setErroForm(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    const pessoasPayload = pessoas
      .filter((p) => !p.liberado)
      .map((p) => ({ id: p.id, nome: p.nome.trim(), documento: p.documento.trim() }))
      .filter((p) => p.nome && p.documento);
    const totalPessoas = pessoas.filter((p) => p.liberado).length + pessoasPayload.length;
    if (totalPessoas === 0) {
      setErroForm("Informe ao menos 1 pessoa (nome e documento).");
      return;
    }
    const veiculosPayload = veiculos
      .filter((v) => !v.liberado)
      .map((v) => ({ id: v.id, placa: v.placa.trim() }))
      .filter((v) => v.placa);

    // Reforma só se aplica na criação (minha unidade) - ver checkbox no form.
    if (!eventoEditandoId && campos.reforma) {
      if (!campos.dataFim) {
        setErroForm("Informe a data de fim da reforma.");
        return;
      }
      const dias = diferencaDias(campos.data, campos.dataFim);
      if (dias < 0) {
        setErroForm("A data de fim não pode ser anterior à data de início.");
        return;
      }
      if (dias > 15) {
        setErroForm("O intervalo entre início e fim da reforma não pode passar de 15 dias.");
        return;
      }
    }

    setErroForm(null);
    setSalvando(true);
    try {
      if (eventoEditandoId) {
        const request = {
          espacoComumId: campos.espacoComumId ? Number(campos.espacoComumId) : undefined,
          motivo: campos.motivo,
          data: campos.data,
          horario: campos.horario.trim() || undefined,
          veiculos: veiculosPayload,
          pessoas: pessoasPayload,
        };
        const atualizado = await atualizarEvento(sessao.token, eventoEditandoId, request);
        setEventos((atual) => atual?.map((ev) => (ev.id === eventoEditandoId ? atualizado : ev)) ?? null);
      } else {
        const request = {
          espacoComumId: campos.espacoComumId ? Number(campos.espacoComumId) : undefined,
          motivo: campos.motivo,
          data: campos.data,
          horario: campos.horario.trim() || undefined,
          reforma: campos.reforma,
          dataFim: campos.reforma ? campos.dataFim : undefined,
          veiculos: veiculosPayload,
          pessoas: pessoasPayload,
        };
        const novos = await criarEvento(sessao.token, request);
        setEventos((atual) => [...[...novos].reverse(), ...(atual ?? [])]);
      }
      setFormAberto(false);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Falha ao salvar evento.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir(evento: EventoResponse) {
    if (!sessao) return;
    if (!window.confirm(`Excluir o evento "${evento.motivo}"? Essa ação não pode ser desfeita.`)) return;
    setErroLista(null);
    setExcluindoId(evento.id);
    try {
      await excluirEvento(sessao.token, evento.id);
      setEventos((atual) => atual?.filter((ev) => ev.id !== evento.id) ?? null);
    } catch (err) {
      setErroLista(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setExcluindoId(null);
    }
  }

  if (!sessao) return null;

  if (!ehMorador) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">Só morador tem acesso a esta tela.</p>
      </AppShell>
    );
  }

  return (
    <AppShell sessao={sessao}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Eventos</h1>
        {!formAberto && <Button onClick={abrirForm}>+ Novo evento</Button>}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Cadastre aqui a festa/visita que você espera - a portaria vai ver e liberar cada pessoa e veículo
        conforme chegam.
      </p>

      {formAberto && (
        <form onSubmit={handleSalvar} className="mt-4 space-y-4 rounded-lg border border-slate-200 p-5">
          <p className="text-sm font-medium text-slate-700">{eventoEditandoId ? "Editar evento" : "Novo evento"}</p>
          {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}

          <div>
            <label className="text-xs text-slate-500">
              Local{dataLocalTravada ? " (não é possível mudar no dia do evento)" : ""}
            </label>
            <select
              value={campos.espacoComumId}
              onChange={(e) =>
                setCampos((c) => ({ ...c, espacoComumId: e.target.value, reforma: false, dataFim: "" }))
              }
              disabled={dataLocalTravada}
              className="block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Minha unidade</option>
              {espacos?.filter((e) => e.situacao === "ativo" || String(e.id) === campos.espacoComumId).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>

          {!eventoEditandoId && campos.espacoComumId === "" && (
            <div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={campos.reforma}
                  onChange={(e) => setCampos((c) => ({ ...c, reforma: e.target.checked, dataFim: "" }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                É uma reforma (dura mais de um dia)
              </label>
              {campos.reforma && (
                <p className="mt-1 text-xs text-slate-400">
                  Um evento será criado pra cada dia do intervalo, repetindo motivo, veículos e pessoas.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500">Motivo</label>
            <Input
              required
              maxLength={200}
              placeholder="ex: Aniversário de 10 anos"
              value={campos.motivo}
              onChange={(e) => setCampos((c) => ({ ...c, motivo: e.target.value }))}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-slate-500">
                {campos.reforma ? "Início" : "Data"}
                {dataLocalTravada ? " (não é possível mudar no dia do evento)" : ""}
              </label>
              <Input
                required
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={campos.data}
                onChange={(e) => setCampos((c) => ({ ...c, data: e.target.value }))}
                disabled={dataLocalTravada}
                className="disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {campos.reforma && (
              <div className="flex-1">
                <label className="text-xs text-slate-500">Fim (até 15 dias após o início)</label>
                <Input
                  required
                  type="date"
                  min={campos.data || new Date().toISOString().slice(0, 10)}
                  value={campos.dataFim}
                  onChange={(e) => setCampos((c) => ({ ...c, dataFim: e.target.value }))}
                />
              </div>
            )}
            <div className="flex-1">
              <label className="text-xs text-slate-500">Horário (opcional)</label>
              <Input
                maxLength={50}
                placeholder="ex: 14h às 20h"
                value={campos.horario}
                onChange={(e) => setCampos((c) => ({ ...c, horario: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500">Veículos (placa) - opcional</label>
              <button
                type="button"
                onClick={() => setVeiculos((v) => [...v, { placa: "", liberado: false }])}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                + Adicionar veículo
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {veiculos.map((veiculo, i) =>
                veiculo.liberado ? (
                  <div key={veiculo.id ?? i} className="flex items-center gap-2">
                    <span className="flex-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      {veiculo.placa}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-emerald-600">Liberado</span>
                  </div>
                ) : (
                  <div key={veiculo.id ?? i} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        maxLength={8}
                        placeholder="ex: ABC1D23"
                        value={veiculo.placa}
                        onChange={(e) => {
                          setVeiculos((v) =>
                            v.map((x, j) => (j === i ? { ...x, placa: e.target.value.toUpperCase() } : x)),
                          );
                          setSugestaoVeiculoAberta(i);
                        }}
                        onFocus={() => setSugestaoVeiculoAberta(i)}
                        onBlur={() =>
                          setTimeout(() => setSugestaoVeiculoAberta((atual) => (atual === i ? null : atual)), 150)
                        }
                      />
                      <ListaSugestoes
                        aberta={sugestaoVeiculoAberta === i}
                        sugestoes={filtrarCandidatosVeiculo(veiculo.placa)}
                        renderOpcao={(c) => c.placa}
                        onSelecionar={(c) => {
                          setVeiculos((v) => v.map((x, j) => (j === i ? { ...x, placa: c.placa } : x)));
                          setSugestaoVeiculoAberta(null);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setVeiculos((v) => v.filter((_, j) => j !== i))}
                      className="shrink-0 text-slate-400 hover:text-red-600"
                    >
                      <IconeLixeira className="h-4 w-4" />
                    </button>
                  </div>
                ),
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500">Pessoas (nome + documento)</label>
              <button
                type="button"
                onClick={() => setPessoas((p) => [...p, { nome: "", documento: "", liberado: false }])}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                + Adicionar pessoa
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {pessoas.map((pessoa, i) =>
                pessoa.liberado ? (
                  <div key={pessoa.id ?? i} className="flex items-center gap-2">
                    <span className="flex-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      {pessoa.nome}
                    </span>
                    <span className="flex-1 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      {pessoa.documento}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-emerald-600">Liberado</span>
                  </div>
                ) : (
                  <div key={pessoa.id ?? i} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        maxLength={120}
                        placeholder="Nome"
                        value={pessoa.nome}
                        onChange={(e) => {
                          setPessoas((p) => p.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)));
                          setSugestaoPessoaAberta(i);
                        }}
                        onFocus={() => setSugestaoPessoaAberta(i)}
                        onBlur={() =>
                          setTimeout(() => setSugestaoPessoaAberta((atual) => (atual === i ? null : atual)), 150)
                        }
                      />
                      <ListaSugestoes
                        aberta={sugestaoPessoaAberta === i}
                        sugestoes={filtrarCandidatosPessoa(pessoa.nome)}
                        renderOpcao={(c) => (
                          <>
                            {c.nome} <span className="text-slate-400">— {c.documento}</span>
                          </>
                        )}
                        onSelecionar={(c) => {
                          setPessoas((p) =>
                            p.map((x, j) => (j === i ? { ...x, nome: c.nome, documento: c.documento } : x)),
                          );
                          setSugestaoPessoaAberta(null);
                        }}
                      />
                    </div>
                    <Input
                      className="flex-1"
                      maxLength={50}
                      placeholder="Documento (RG/CPF)"
                      value={pessoa.documento}
                      onChange={(e) =>
                        setPessoas((p) => p.map((x, j) => (j === i ? { ...x, documento: e.target.value } : x)))
                      }
                    />
                    {pessoas.filter((x) => !x.liberado).length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPessoas((p) => p.filter((_, j) => j !== i))}
                        className="shrink-0 text-slate-400 hover:text-red-600"
                      >
                        <IconeLixeira className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFormAberto(false);
                setEventoEditandoId(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : eventoEditandoId ? "Salvar alterações" : "Cadastrar evento"}
            </Button>
          </div>
        </form>
      )}

      {!formAberto && (
        <div className="mt-6">
          {erroLista && <p className="text-sm text-red-600">{erroLista}</p>}
          {eventos === null && !erroLista && <p className="text-sm text-slate-500">Carregando...</p>}
          {eventos?.length === 0 && <p className="text-sm text-slate-500">Você ainda não cadastrou nenhum evento.</p>}
          <div className="space-y-3">
            {eventos?.map((evento) => {
              const totalItens = evento.veiculos.length + evento.pessoas.length;
              const totalLiberados =
                evento.veiculos.filter((v) => v.liberado).length + evento.pessoas.filter((p) => p.liberado).length;
              return (
                <div key={evento.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-3">
                      {eventoFuturo(evento) && (
                        <span className="flex shrink-0 items-center gap-3 text-slate-400">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(evento)}
                            title="Editar"
                            disabled={excluindoId !== null}
                            className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <IconeLapis className="h-4 w-4" />
                          </button>
                          {podeExcluir(evento) && (
                            <button
                              type="button"
                              onClick={() => handleExcluir(evento)}
                              title="Excluir"
                              disabled={excluindoId !== null}
                              className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <IconeLixeira className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-900">
                        {evento.motivo} — {new Date(evento.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                      {evento.reforma && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Reforma
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      {totalLiberados}/{totalItens} liberados
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Local: {evento.espacoComumNome ?? "Minha unidade"}
                    {evento.horario ? ` · ${evento.horario}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
