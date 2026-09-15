"use client";

import { useEffect, useState } from "react";
import {
  atualizarTarefaAgendada,
  criarTarefaAgendada,
  excluirTarefaAgendada,
  listarTarefasAgendadas,
  TarefaAgendadaResponse,
} from "@/lib/api";
import { Sessao } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button, Input } from "@/components/ui";
import { IconeLapis, IconeLixeira, IconeSino } from "@/components/icons";

/** Data de hoje no fuso do usuário, no formato yyyy-MM-dd (mesmo formato que o backend
 * devolve pra `LocalDate` e que o `<input type="date">` usa) - comparação é só string. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-09-01" -> "01/09/2026" sem passar por `new Date` (que interpretaria como UTC e
 * poderia pular um dia em fuso negativo). */
function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Regras de validação do formulário (pedido do Romulo): os dois avisos têm que ser ANTES
 * da data da tarefa, os dois avisos não podem cair no mesmo dia, e o segundo aviso não pode
 * ser antes do primeiro. Datas em yyyy-MM-dd, então comparação de string já basta (mesma
 * ordem lexicográfica e cronológica) - o backend confere de novo (fonte da verdade), isso
 * aqui é só pra dar o erro na hora, sem esperar o round-trip. */
function validarDatasTarefa(dataTarefa: string, dataPrimeiroAviso: string, dataSegundoAviso: string): string | null {
  if (dataPrimeiroAviso >= dataTarefa) {
    return "A data do primeiro aviso não pode ser igual ou depois da data da tarefa.";
  }
  if (dataSegundoAviso >= dataTarefa) {
    return "A data do segundo aviso não pode ser igual ou depois da data da tarefa.";
  }
  if (dataPrimeiroAviso === dataSegundoAviso) {
    return "As datas dos avisos não podem ser iguais.";
  }
  if (dataSegundoAviso < dataPrimeiroAviso) {
    return "A data do segundo aviso não pode ser antes da data do primeiro aviso.";
  }
  return null;
}

function ordenar(lista: TarefaAgendadaResponse[]): TarefaAgendadaResponse[] {
  return [...lista].sort(
    (a, b) => a.proximaDataRelevante.localeCompare(b.proximaDataRelevante) || a.id - b.id,
  );
}

/** Alguma das três datas da tarefa cai hoje? (o que a torna um "alerta"). */
function ehAlerta(t: TarefaAgendadaResponse, hoje: string): boolean {
  return t.dataTarefa === hoje || t.dataPrimeiroAviso === hoje || t.dataSegundoAviso === hoje;
}

/** Ano/mês (0-based, igual `Date`)/dia -> "yyyy-MM-dd", pro grid do calendário. */
function isoDe(ano: number, mesZeroBased: number, dia: number): string {
  return `${ano}-${String(mesZeroBased + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Marca no sessionStorage que o alerta automático de login já foi mostrado pra este
 * token - assim ele aparece uma vez por login, não a cada troca de tela (o AppShell,
 * e portanto este componente, remonta a cada navegação). Novo login = novo token = mostra
 * de novo. Tudo em try/catch porque sessionStorage pode falhar (aba anônima, etc.). */
function chaveAlertaVisto(token: string): string {
  return `alertaTarefasVisto:${token.slice(-24)}`;
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

const FORM_VAZIO = {
  titulo: "",
  descricao: "",
  dataTarefa: "",
  dataPrimeiroAviso: "",
  dataSegundoAviso: "",
};

/** Sininho no menu do topo (só funcionário) - fica vermelho quando alguma tarefa agendada
 * tem data (da tarefa, do 1º ou do 2º aviso) caindo hoje. Clicar abre um modal com o
 * formulário de cadastro (nos moldes do de demandas) + a listagem, já ordenada pela data
 * mais próxima (o que precisa de atenção primeiro fica no topo).
 *
 * Além disso, assim que o funcionário loga, se houver tarefa com data pra hoje, o mesmo
 * modal abre sozinho já num modo "alerta" (só a lista do que é pra hoje) - o funcionário
 * vê de imediato e só segue pra tela de trás depois de fechar. Aparece uma vez por login
 * (ver `chaveAlertaVisto`), não a cada troca de tela. */
export function SinoTarefas({ sessao }: { sessao: Sessao }) {
  const [tarefas, setTarefas] = useState<TarefaAgendadaResponse[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  // true = modal foi aberto sozinho no login (mostra só os alertas de hoje + botão "ver
  // todas"); false = aberto pelo clique no sino (mostra o form + a lista completa).
  const [modoAlerta, setModoAlerta] = useState(false);

  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  // Formulário de cadastro dentro de um agrupador fechado por padrão (pedido do Romulo:
  // dar foco na listagem) - mesmo padrão de "+ Nova demanda" em `/demandas`.
  const [formNovaTarefaAberto, setFormNovaTarefaAberto] = useState(false);

  // Calendário (pedido do Romulo): clicar no sino agora abre o calendário do mês em vez
  // da lista direto - "Ver todas" leva pra tela de sempre (form + lista completa), mesmo
  // padrão que o modo alerta já usava pro botão de mesmo nome. `diaSelecionado` começa em
  // hoje (mesmo espírito do modo alerta: já mostra o que é relevante agora, sem precisar
  // clicar em nada).
  const [view, setView] = useState<"calendario" | "lista">("calendario");
  const [mesAtual, setMesAtual] = useState(() => new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(hojeISO());

  // Editar/remover (pedido do Romulo) - edição inline na própria linha, mesmo padrão de
  // Etiqueta/MensagemRapida na aba de condomínio. "Remover" é soft-delete (some da lista).
  const [tarefaEditando, setTarefaEditando] = useState<number | null>(null);
  const [edicaoTarefa, setEdicaoTarefa] = useState(FORM_VAZIO);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [erroLinha, setErroLinha] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    listarTarefasAgendadas(sessao.token)
      .then((lista) => {
        if (cancelado) return;
        setTarefas(ordenar(lista));
        setErro(null);
        // Alerta automático de login: só se tiver algo pra hoje e ainda não foi mostrado
        // pra este token nesta sessão de navegador.
        const hoje = hojeISO();
        if (lista.some((t) => ehAlerta(t, hoje)) && !alertaJaVisto(sessao.token)) {
          marcarAlertaVisto(sessao.token);
          setModoAlerta(true);
          setAberto(true);
        }
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Falha ao carregar as tarefas agendadas.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao.token]);

  const hoje = hojeISO();

  /** Quais das 3 datas da tarefa caem num dia específico - generalização de "cai hoje"
   * pra qualquer dia clicado no calendário (ver `linhaTarefa`/`tarefasNoDia`). */
  function datasNoDia(t: TarefaAgendadaResponse, dia: string): string[] {
    return [t.dataTarefa, t.dataPrimeiroAviso, t.dataSegundoAviso].filter((d) => d === dia);
  }

  function datasHoje(t: TarefaAgendadaResponse): string[] {
    return datasNoDia(t, hoje);
  }

  /** Tarefas com alguma das 3 datas nesse dia - usada pela lista abaixo do calendário. */
  function tarefasNoDia(dia: string): TarefaAgendadaResponse[] {
    return (tarefas ?? []).filter((t) => datasNoDia(t, dia).length > 0);
  }

  const temHoje = (tarefas ?? []).some((t) => datasHoje(t).length > 0);
  const alertasHoje = (tarefas ?? []).filter((t) => datasHoje(t).length > 0);

  function abrirPeloSino() {
    setForm(FORM_VAZIO);
    setErroForm(null);
    setModoAlerta(false);
    setTarefaEditando(null);
    setErroLinha(null);
    setFormNovaTarefaAberto(false);
    setView("calendario");
    setMesAtual(new Date());
    setDiaSelecionado(hoje);
    setAberto(true);
  }

  /** "+ Nova tarefa" do calendário (pedido do Romulo: ao lado de "Ver todas", já abrindo
   * o agrupador de cadastro) - vai pra mesma tela de sempre (form + lista completa), só
   * que com o agrupador já expandido, sem precisar de um clique extra em "+ Nova tarefa"
   * de novo lá dentro. */
  function abrirNovaTarefaDoCalendario() {
    setFormNovaTarefaAberto(true);
    setView("lista");
  }

  function fechar() {
    setAberto(false);
    setModoAlerta(false);
    setTarefaEditando(null);
    setErroLinha(null);
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    const erroValidacao = validarDatasTarefa(form.dataTarefa, form.dataPrimeiroAviso, form.dataSegundoAviso);
    if (erroValidacao) {
      setErroForm(erroValidacao);
      return;
    }
    setErroForm(null);
    setSalvando(true);
    try {
      const nova = await criarTarefaAgendada(sessao.token, { ...form });
      setTarefas((atual) => ordenar([...(atual ?? []), nova]));
      setForm(FORM_VAZIO);
      // Fecha o agrupador de volta pra listagem (pedido do Romulo), mesmo padrão de
      // "+ Nova demanda" em `/demandas`.
      setFormNovaTarefaAberto(false);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Falha ao cadastrar a tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(t: TarefaAgendadaResponse) {
    setTarefaEditando(t.id);
    setEdicaoTarefa({
      titulo: t.titulo,
      descricao: t.descricao,
      dataTarefa: t.dataTarefa,
      dataPrimeiroAviso: t.dataPrimeiroAviso,
      dataSegundoAviso: t.dataSegundoAviso,
    });
    setErroLinha(null);
  }

  async function handleSalvarEdicao(id: number) {
    const erroValidacao = validarDatasTarefa(
      edicaoTarefa.dataTarefa,
      edicaoTarefa.dataPrimeiroAviso,
      edicaoTarefa.dataSegundoAviso,
    );
    if (erroValidacao) {
      setErroLinha(erroValidacao);
      return;
    }
    setErroLinha(null);
    setSalvandoEdicao(true);
    try {
      const atualizada = await atualizarTarefaAgendada(sessao.token, id, { ...edicaoTarefa });
      setTarefas((atual) => ordenar((atual ?? []).map((t) => (t.id === id ? atualizada : t))));
      setTarefaEditando(null);
    } catch (err) {
      setErroLinha(err instanceof Error ? err.message : "Falha ao salvar a tarefa.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  /** "Remover" é soft-delete (situacao = inativo) - some da lista, sem apagar nada do banco. */
  async function handleExcluir(id: number) {
    setErroLinha(null);
    setExcluindoId(id);
    try {
      await excluirTarefaAgendada(sessao.token, id);
      setTarefas((atual) => (atual ?? []).filter((t) => t.id !== id));
    } catch (err) {
      setErroLinha(err instanceof Error ? err.message : "Falha ao remover a tarefa.");
    } finally {
      setExcluindoId(null);
    }
  }

  /** Card de uma tarefa na listagem - usado no modo alerta (`podeEditar = false`, só o
   * resumo do que é pra hoje), na lista completa (`podeEditar = true`, ganha lápis/lixeira
   * - pedido do Romulo: "colocar editar e remover") e na lista de um dia do calendário
   * (`podeEditar = true`, `dataDestaque` = o dia clicado em vez de hoje). Editar vira um
   * formulário inline no lugar do card, mesmo padrão de Etiqueta/MensagemRapida.
   * `tarefaPorUltimo` reordena os três badges de data pra deixar "Tarefa" por último em vez
   * de primeiro (pedido do Romulo, só pro modal de alerta ao logar - ver `modoAlerta`).
   * `dataDestaque` é qual das 3 datas fica destacada em vermelho nos badges - hoje por
   * default, mas o dia clicado no calendário quando chamado de lá (ver `renderCalendario`). */
  function linhaTarefa(t: TarefaAgendadaResponse, podeEditar: boolean, tarefaPorUltimo = false, dataDestaque = hoje) {
    if (podeEditar && tarefaEditando === t.id) {
      return (
        <div key={t.id} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Input
            required
            placeholder="Título"
            value={edicaoTarefa.titulo}
            onChange={(e) => setEdicaoTarefa((c) => ({ ...c, titulo: e.target.value }))}
          />
          <MarkdownEditor
            required
            placeholder="Descrição"
            value={edicaoTarefa.descricao}
            onChange={(descricao) => setEdicaoTarefa((c) => ({ ...c, descricao }))}
            rows={3}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Data da tarefa
              <input
                type="date"
                required
                value={edicaoTarefa.dataTarefa}
                onChange={(e) => setEdicaoTarefa((c) => ({ ...c, dataTarefa: e.target.value }))}
                className="rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              1º aviso
              <input
                type="date"
                required
                value={edicaoTarefa.dataPrimeiroAviso}
                onChange={(e) => setEdicaoTarefa((c) => ({ ...c, dataPrimeiroAviso: e.target.value }))}
                className="rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              2º aviso
              <input
                type="date"
                required
                value={edicaoTarefa.dataSegundoAviso}
                onChange={(e) => setEdicaoTarefa((c) => ({ ...c, dataSegundoAviso: e.target.value }))}
                className="rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
          {erroLinha && <p className="text-xs text-red-600">{erroLinha}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTarefaEditando(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={salvandoEdicao} onClick={() => handleSalvarEdicao(t.id)}>
              {salvandoEdicao ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      );
    }

    const marcadas = datasNoDia(t, dataDestaque);
    const ehHoje = (d: string) => marcadas.includes(d);
    return (
      <div
        key={t.id}
        className={`rounded-lg border p-3 ${
          marcadas.length > 0 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">{t.titulo}</p>
          {podeEditar && (
            <div className="flex shrink-0 items-center gap-2 text-slate-400">
              <button
                type="button"
                onClick={() => abrirEdicao(t)}
                title="Editar"
                disabled={tarefaEditando !== null || excluindoId !== null}
                className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconeLapis className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleExcluir(t.id)}
                title="Remover"
                disabled={tarefaEditando !== null || excluindoId !== null}
                className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconeLixeira className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
          {(() => {
            const badgeTarefa = (
              <span
                key="tarefa"
                className={`rounded-full px-2 py-0.5 ${
                  ehHoje(t.dataTarefa) ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                Tarefa: {formatarDataBR(t.dataTarefa)}
              </span>
            );
            const badgePrimeiroAviso = (
              <span
                key="primeiro"
                className={`rounded-full px-2 py-0.5 ${
                  ehHoje(t.dataPrimeiroAviso) ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                1º aviso: {formatarDataBR(t.dataPrimeiroAviso)}
              </span>
            );
            const badgeSegundoAviso = (
              <span
                key="segundo"
                className={`rounded-full px-2 py-0.5 ${
                  ehHoje(t.dataSegundoAviso) ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                2º aviso: {formatarDataBR(t.dataSegundoAviso)}
              </span>
            );
            return tarefaPorUltimo
              ? [badgePrimeiroAviso, badgeSegundoAviso, badgeTarefa]
              : [badgeTarefa, badgePrimeiroAviso, badgeSegundoAviso];
          })()}
        </div>
        {t.descricao && <Markdown texto={t.descricao} className="mt-2 text-sm text-slate-600" />}
        <p className="mt-2 text-xs italic text-slate-400">por {t.funcionarioNome}</p>
      </div>
    );
  }

  /** Calendário do mês (pedido do Romulo: "abrir um calendário para mostrar as tarefas
   * agendadas. Ao clicar na data, mostra a listagem das tarefas") - tela que abre por
   * padrão ao clicar no sino (ver `abrirPeloSino`/`view`). Bolinha azul no dia quando
   * alguma tarefa tem `dataTarefa` ali, âmbar quando é `dataPrimeiroAviso`/
   * `dataSegundoAviso` - os dois podem aparecer juntos no mesmo dia. Clicar num dia só
   * troca `diaSelecionado`; a lista abaixo reaproveita `linhaTarefa` (mesmo
   * editar/remover de sempre), só que destacando as datas daquele dia em vez de hoje. */
  function renderCalendario() {
    const ano = mesAtual.getFullYear();
    const mes = mesAtual.getMonth();
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes + 1, 0).getDate();
    const dias = Array.from({ length: totalDias }, (_, i) => ({ dia: i + 1, iso: isoDe(ano, mes, i + 1) }));
    const tarefasDoDia = tarefasNoDia(diaSelecionado);

    return (
      <div className="mt-4">
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
            const marcas = tarefasNoDia(iso);
            const temTarefa = marcas.some((t) => t.dataTarefa === iso);
            const temAviso = marcas.some((t) => t.dataPrimeiroAviso === iso || t.dataSegundoAviso === iso);
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
                  {temTarefa && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                  {temAviso && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> data da tarefa
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> aviso
          </span>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-400">
            Tarefas em {formatarDataBR(diaSelecionado)}
            {diaSelecionado === hoje && " (hoje)"}
          </p>
          {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
          {!erro && tarefas === null && <p className="mt-2 text-sm text-slate-500">Carregando...</p>}
          {erroLinha && tarefaEditando === null && <p className="mt-2 text-sm text-red-600">{erroLinha}</p>}
          <div className="mt-2 space-y-2">
            {tarefas !== null && tarefasDoDia.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma tarefa nesse dia.</p>
            )}
            {tarefasDoDia.map((t) => linhaTarefa(t, true, false, diaSelecionado))}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setView("lista")}>
            Ver todas
          </Button>
          <Button type="button" onClick={abrirNovaTarefaDoCalendario}>
            + Nova tarefa
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={abrirPeloSino}
        title={
          temHoje
            ? "Tarefas agendadas — há tarefa com data pra hoje"
            : "Tarefas agendadas"
        }
        className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-800 ${
          temHoje ? "text-red-400 hover:text-red-300" : "text-slate-200 hover:text-white"
        }`}
      >
        <IconeSino className="h-5 w-5" />
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fechar}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 text-slate-900 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            {/* Título centralizado (pedido do Romulo) - mesmo padrão pro modo alerta e pro
                normal: botão fechar em posição absoluta pra não disputar espaço com o
                título e sair de centro. */}
            <div className="relative flex items-start justify-center gap-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {modoAlerta
                  ? "Alertas de hoje"
                  : `Tarefas agendadas${sessao.condominioNome ? ` — ${sessao.condominioNome}` : ""}`}
              </h2>
              <button
                type="button"
                onClick={fechar}
                className="absolute right-0 top-0 shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {modoAlerta ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-400">
                  Você tem {alertasHoje.length} alerta(s). Verifique e aja!
                </p>
                {alertasHoje.map((t) => linhaTarefa(t, false, true))}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setModoAlerta(false)}>
                    Ver todas
                  </Button>
                  <Button type="button" onClick={fechar}>
                    Fechar
                  </Button>
                </div>
              </div>
            ) : view === "calendario" ? (
              renderCalendario()
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setView("calendario")}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  ← Calendário
                </button>

                {/* Formulário de cadastro dentro de um agrupador fechado por padrão
                    (pedido do Romulo: dar foco na listagem) - mesmo padrão de "+ Nova
                    demanda" em `/demandas`. */}
                {!formNovaTarefaAberto ? (
                  <div className="mt-4 flex justify-start">
                    <Button type="button" onClick={() => setFormNovaTarefaAberto(true)}>
                      + Nova tarefa
                    </Button>
                  </div>
                ) : (
                <form onSubmit={handleCriar} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">Nova tarefa</p>
                    <button
                      type="button"
                      onClick={() => setFormNovaTarefaAberto(false)}
                      title="Fechar"
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                  <Input
                    required
                    placeholder="Título"
                    value={form.titulo}
                    onChange={(e) => setForm((c) => ({ ...c, titulo: e.target.value }))}
                  />
                  <MarkdownEditor
                    required
                    placeholder="Descrição"
                    value={form.descricao}
                    onChange={(descricao) => setForm((c) => ({ ...c, descricao }))}
                    rows={4}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Data da tarefa
                      <input
                        type="date"
                        required
                        value={form.dataTarefa}
                        onChange={(e) => setForm((c) => ({ ...c, dataTarefa: e.target.value }))}
                        className="rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      1º aviso
                      <input
                        type="date"
                        required
                        value={form.dataPrimeiroAviso}
                        onChange={(e) => setForm((c) => ({ ...c, dataPrimeiroAviso: e.target.value }))}
                        className="rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      2º aviso
                      <input
                        type="date"
                        required
                        value={form.dataSegundoAviso}
                        onChange={(e) => setForm((c) => ({ ...c, dataSegundoAviso: e.target.value }))}
                        className="rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                  {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}
                  <div className="flex justify-end">
                    <Button type="submit" disabled={salvando}>
                      {salvando ? "Salvando..." : "Cadastrar"}
                    </Button>
                  </div>
                </form>
                )}

                <div className="mt-4 space-y-2">
                  {erro && <p className="text-sm text-red-600">{erro}</p>}
                  {!erro && tarefas === null && <p className="text-sm text-slate-500">Carregando...</p>}
                  {tarefas?.length === 0 && (
                    <p className="text-sm text-slate-500">Nenhuma tarefa agendada ainda.</p>
                  )}
                  {/* Erro de remover mostra aqui (o de editar já aparece dentro do próprio
                      formulário inline, ver linhaTarefa). */}
                  {erroLinha && tarefaEditando === null && <p className="text-sm text-red-600">{erroLinha}</p>}
                  {tarefas?.map((t) => linhaTarefa(t, true))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
