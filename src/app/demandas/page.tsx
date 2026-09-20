"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  alternarConcluidaEtapa,
  alternarSigiloDemanda,
  aprovarDemanda,
  atribuirResponsavel,
  CandidatoAcessoResponse,
  CandidatoResponsavelResponse,
  concederAcessoSigiloso,
  criarDemanda,
  criarEtapa,
  criarNotaDemanda,
  DemandaAcessoSigilosoResponse,
  DemandaDocumentoResponse,
  DemandaEtapaResponse,
  DemandaNotaResponse,
  DemandaResponse,
  DemandaResponsavelResponse,
  DemandaStatusAprovacao,
  listarAcessoSigiloso,
  listarCandidatosAcesso,
  listarCandidatosResponsavel,
  listarDocumentosDemanda,
  listarEtapas,
  listarMensagensRapidas,
  listarNotasDemanda,
  listarPaginaDemandas,
  listarResponsaveis,
  listarStatusKanban,
  listarVisualizacaoPorRegra,
  marcarNotaLida,
  MensagemRapidaResponse,
  PERFIL_LABEL,
  removerDocumentoDemanda,
  removerResponsavel,
  reprovarDemanda,
  revogarAcessoSigiloso,
  StatusKanbanResponse,
  uploadDocumentoDemanda,
  urlImagem,
  VisualizadorPorRegraResponse,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { apenasDigitos, etapaVencida, etapaVigente } from "@/lib/format";
import { ehVideo } from "@/lib/imagem-upload";
import { AppShell, EVENTO_ALERTAS_DEMANDAS } from "@/components/app-shell";
import { Markdown } from "@/components/markdown";
import { AdicionarAnexoBotao } from "@/components/adicionar-anexo-botao";
import { ComboFuncionario } from "@/components/combo-funcionario";
import { ComboPessoa } from "@/components/combo-pessoa";
import {
  IconeChecklist,
  IconeColunas,
  IconeCopiar,
  IconeNotaLida,
  IconeNotaPendente,
  IconePlay,
  IconeRaio,
  IconeRecusar,
  IconeRelogio,
  IconeResponsavel,
  IconeUpload,
} from "@/components/icons";
import { MarkdownEditor } from "@/components/markdown-editor";
import { UploadImagens } from "@/components/upload-imagens";
import { Button, Input } from "@/components/ui";

const STATUS_LABEL: Record<DemandaStatusAprovacao, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
};

const STATUS_CLASSES: Record<DemandaStatusAprovacao, string> = {
  pendente: "bg-amber-50 text-amber-700",
  aprovada: "bg-emerald-50 text-emerald-700",
  reprovada: "bg-red-50 text-red-700",
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// `identificarSolicitante: null` = "segue o padrão do papel de quem tá logado" (marcado
// pra funcionário, desmarcado pra morador) - só vira um boolean explícito quando a
// pessoa mexe na caixa. Evita um efeito só pra sincronizar o valor inicial com a sessão.
const FORM_VAZIO = { titulo: "", descricao: "", sigilosa: false, identificarSolicitante: null as boolean | null };

/** Cadastro de demandas - morador e funcionário abrem, sempre no condomínio do próprio
 * contexto (nunca um id escolhido na tela). Funcionário vê todas as demandas do
 * condomínio; morador só as que ele mesmo abriu (ver DemandaService no backend).
 *
 * Etapas: pra funcionário, o painel de cada demanda já vem com as etapas já
 * cadastradas visíveis direto (sem precisar clicar em nada) - `etapasPorDemanda`
 * carrega uma vez por demanda, na primeira vez que ela aparece na lista.
 *
 * Identificação: "Aberta por" some (vira "Anônimo") quando `identificarSolicitante` é
 * false - desmarcado por padrão pra morador (reclamação sem se identificar pros
 * funcionários), marcado por padrão pra funcionário.
 *
 * Imagens/vídeo (item 4.9, vídeo desde o pedido do Romulo: "até 15mb, no máximo 3 fotos
 * e 1 vídeo por demanda" - limite de quantidade e tamanho conferido de novo no backend,
 * `DemandaDocumentoService`): no formulário de cadastro, a seleção (`UploadImagens`) fica
 * só no navegador até "Cadastrar" - cada arquivo sobe individualmente depois que a
 * demanda já existe (precisa do id). Depois de cadastrada, cada demanda na listagem
 * também tem seu próprio "+" (`AdicionarAnexoBotao`) pra anexar mais imagem/vídeo direto
 * ali, sem reabrir formulário nenhum - sobe na hora, já que o id já existe. Miniatura de
 * vídeo é o próprio `<video>` (primeiro frame) com um selo de "play" por cima
 * (`IconePlay`), pra diferenciar de foto sem precisar abrir. Os anexos já enviados
 * aparecem sozinhos em cada demanda, mesmo padrão de `etapasPorDemanda` mas pros dois
 * papéis (não só funcionário) - quem pode ver a demanda também vê, adiciona e remove os
 * anexos dela (o backend confere de novo, `DemandaDocumentoService`).
 *
 * Sigilo: funcionário pode "editar" uma demanda depois de criada, mas só pra
 * marcar/desmarcar sigilosa - checkbox direto no título, sem formulário de edição
 * separado. Quando sigilosa, só quem `podeGerenciarSigilo` (síndico/sub-síndico, ou o
 * funcionário que marcou) vê o link "Gerenciar acesso" - abre um painel pra indicar mais
 * gente (ou tirar quem já tinha sido indicado), buscando por nome/unidade/CPF numa combo
 * (`ComboPessoa`, ver `listarCandidatosAcesso`) em vez de precisar decorar o CPF - lista
 * todo mundo (morador ou funcionário) ativo no condomínio. O backend já filtra quem NEM
 * aparece na listagem pra quem não tem acesso (ver DemandaService.listar). Pra quem TEM
 * acesso, `#id` e título aparecem em vermelho e itálico (`d.sigilosa`) - reforço visual de
 * que aquilo ali é sigiloso, mesma regra aplicada no card do Kanban. */
function DemandasPageInner() {
  const sessao = useSessaoObrigatoria();
  const searchParams = useSearchParams();
  // `?notaNaoLida=1` (pedido do Romulo): o ícone do menu no topo, que leva pra cá já
  // filtrado, manda esse parâmetro - lido só na primeira renderização (inicializador
  // preguiçoso do useState, não um efeito) pra virar o estado inicial do filtro. Depois
  // disso o usuário pode desligar o filtro normalmente clicando no ícone da listagem, sem
  // a URL "puxar" ele de volta a cada re-render.
  const notaNaoLidaViaUrl = searchParams.get("notaNaoLida") === "1";
  // Mesma ideia, pro ícone de etapa em atraso (ver `components/menu-etapa-vencida.tsx`).
  const etapaVencidaViaUrl = searchParams.get("etapaVencida") === "1";

  // Pedido do Romulo: "paginar a listagem das demandas em 20 registros" - `demandas`
  // guarda só a PÁGINA atual (não mais a lista inteira), já filtrada pelo backend
  // (`listarPaginaDemandas`) - paginar e filtrar client-side ao mesmo tempo não faz
  // sentido (filtrar só dentro da página exibida esconderia resultado que estaria em
  // outra página).
  const [demandas, setDemandas] = useState<DemandaResponse[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [paginaDemanda, setPaginaDemanda] = useState(0);
  const [totalPaginasDemanda, setTotalPaginasDemanda] = useState(0);
  const [totalItensDemanda, setTotalItensDemanda] = useState(0);
  // Aviso ambiente do ícone de nota/etapa no topo (ver mais abaixo) - cobre TODAS as
  // demandas visíveis do condomínio, não só a página atual, por isso vem pronto do
  // backend em vez de calculado aqui em cima de `demandas` (que agora é só uma página).
  const [existeNotaNaoLida, setExisteNotaNaoLida] = useState(false);
  const [existeEtapaVencida, setExisteEtapaVencida] = useState(false);

  // Listagem colapsada por padrão (pedido do Romulo: "exibir apenas o título e o status,
  // tendo o usuário que clicar para expandir" - consulta menos custosa, já que etapas/
  // anexos/notas de cada demanda só carregam quando a linha é expandida, ver os 3
  // useEffect abaixo, em vez de todas de uma vez pra toda demanda da lista).
  const [expandidosIds, setExpandidosIds] = useState<Set<number>>(new Set());
  function alternarExpandido(demandaId: number) {
    setExpandidosIds((atual) => {
      const novo = new Set(atual);
      if (novo.has(demandaId)) {
        novo.delete(demandaId);
      } else {
        novo.add(demandaId);
      }
      return novo;
    });
  }

  // Copiar "#N - Título" (pedido do Romulo, mesmo ícone/comportamento do modal de detalhe
  // do Kanban) - guarda o id pra saber qual linha mostra "Copiado!" (a lista tem várias
  // demandas na tela ao mesmo tempo, diferente do Kanban que só tem 1 modal aberto).
  const [tituloCopiadoId, setTituloCopiadoId] = useState<number | null>(null);
  async function handleCopiarTitulo(d: DemandaResponse) {
    try {
      await navigator.clipboard.writeText(`#${d.id} - ${d.titulo}`);
      setTituloCopiadoId(d.id);
      setTimeout(() => setTituloCopiadoId(null), 2000);
    } catch {
      // Silencioso - é só um atalho de conveniência, não vale mostrar erro pra isso.
    }
  }

  // Filtros da listagem - viraram server-side (ver `listarPaginaDemandas`) desde que a
  // paginação de 20 em 20 entrou (antes filtravam client-side, sobre a lista inteira já
  // carregada). `filtroStatus: null` = "segue o padrão do papel de quem tá logado"
  // (Pendente pra funcionário, Todos pra morador) - mesmo truque de
  // `identificarSolicitante` no formulário, só vira um valor explícito quando a pessoa
  // mexe no seletor. Pedido do Romulo: o mesmo campo passou a aceitar também uma situação
  // do Kanban, não só o status de aprovação - por isso o tipo é `string` livre agora:
  // continua sendo o valor puro (`"pendente"`/`"aprovada"`/`"reprovada"`) pra status de
  // aprovação, e vira `"kanban:<id>"` pra situação do Kanban (o backend faz essa mesma
  // distinção, ver `DemandaService.listarPagina`).
  const [buscaDescricao, setBuscaDescricao] = useState("");
  // Texto "debounced" da busca - só esse entra na dependência do fetch (ver useEffect mais
  // abaixo), pra não bater uma request por tecla digitada (mesmo padrão usado em
  // `condominios/page.tsx` pra funcionário/morador).
  const [buscaEfetivaDescricao, setBuscaEfetivaDescricao] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string | null>(
    notaNaoLidaViaUrl || etapaVencidaViaUrl ? "" : null,
  );
  // Filtro em forma de ícone (pedido do Romulo): só demandas com pelo menos uma nota
  // ainda não lida - usa o flag `temNotaPendente` que já vem pronto no payload (calculado
  // em lote no backend), não precisa de campo novo na API.
  const [filtroNotaNaoLida, setFiltroNotaNaoLida] = useState(notaNaoLidaViaUrl);
  // Mesma ideia, agora pra etapa com prazo vencido e ainda aberta (pedido do Romulo,
  // mesmo critério de "vencida" usado no contorno vermelho do card do Kanban - ver
  // `etapaVencida` em `lib/format.ts`) - usa o flag `temEtapaVencida` do payload.
  const [filtroEtapaVencida, setFiltroEtapaVencida] = useState(etapaVencidaViaUrl);

  // Formulário de cadastro fica dentro de um agrupador fechado por padrão (pedido do
  // Romulo: dar foco na listagem, só abre o formulário quem clicar).
  const [formNovaDemandaAberto, setFormNovaDemandaAberto] = useState(false);
  const [campos, setCampos] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [imagensNovas, setImagensNovas] = useState<File[]>([]);

  const [etapasPorDemanda, setEtapasPorDemanda] = useState<Record<number, DemandaEtapaResponse[]>>({});
  const [erroEtapasPorDemanda, setErroEtapasPorDemanda] = useState<Record<number, string>>({});
  const [etapaFormPorDemanda, setEtapaFormPorDemanda] = useState<Record<number, { nome: string; prazo: string }>>({});
  const [salvandoEtapaId, setSalvandoEtapaId] = useState<number | null>(null);
  const etapasCarregadasRef = useRef<Set<number>>(new Set());

  const [documentosPorDemanda, setDocumentosPorDemanda] = useState<Record<number, DemandaDocumentoResponse[]>>({});
  const [erroDocumentosPorDemanda, setErroDocumentosPorDemanda] = useState<Record<number, string>>({});
  const documentosCarregadosRef = useRef<Set<number>>(new Set());

  // Pedido do Romulo: "Etapas"/"Imagens" só mostram o formulário quando já existe pelo
  // menos um registro (ou enquanto ainda carrega) - senão vira um link, mesmo padrão já
  // usado pro modal de detalhe do Kanban. Guarda quem já foi clicado (por demanda, já que
  // a listagem inteira renderiza ao mesmo tempo, diferente do modal do Kanban).
  const [etapasAbertoPorDemanda, setEtapasAbertoPorDemanda] = useState<Record<number, boolean>>({});
  const [imagensAbertoPorDemanda, setImagensAbertoPorDemanda] = useState<Record<number, boolean>>({});

  // Notas (pedido do Romulo): morador pergunta sobre o andamento, funcionário responde se
  // julgar necessário - mesmo padrão de carregamento automático de `documentosPorDemanda`
  // (pros dois papéis, sem precisar clicar em nada).
  const [notasPorDemanda, setNotasPorDemanda] = useState<Record<number, DemandaNotaResponse[]>>({});
  const [erroNotasPorDemanda, setErroNotasPorDemanda] = useState<Record<number, string>>({});
  const notasCarregadasRef = useRef<Set<number>>(new Set());
  const [novaNotaPorDemanda, setNovaNotaPorDemanda] = useState<Record<number, string>>({});
  const [salvandoNovaNotaId, setSalvandoNovaNotaId] = useState<number | null>(null);
  // Resposta a uma nota - só uma aberta por vez (mesmo padrão de `decisaoAberta`/
  // `acessoSigiloAberto`), guardada pelo id da nota-pai sendo respondida.
  const [respostaAberta, setRespostaAberta] = useState<number | null>(null);
  const [textoResposta, setTextoResposta] = useState("");
  const [salvandoRespostaId, setSalvandoRespostaId] = useState<number | null>(null);
  const [erroRespostaPorNota, setErroRespostaPorNota] = useState<Record<number, string>>({});
  const [marcandoLidaId, setMarcandoLidaId] = useState<number | null>(null);

  const [erroSigiloPorDemanda, setErroSigiloPorDemanda] = useState<Record<number, string>>({});

  const [acessoSigiloAberto, setAcessoSigiloAberto] = useState<number | null>(null);
  const [acessosPorDemanda, setAcessosPorDemanda] = useState<Record<number, DemandaAcessoSigilosoResponse[]>>({});
  const [candidatosAcessoPorDemanda, setCandidatosAcessoPorDemanda] = useState<
    Record<number, CandidatoAcessoResponse[]>
  >({});
  // Quem já vê a demanda sigilosa POR REGRA (síndico/sub-síndico do condomínio, pedido
  // do Romulo v151) - informativo, sem botão de revogar, diferente de `acessosPorDemanda`.
  const [visualizadoresPorRegraPorDemanda, setVisualizadoresPorRegraPorDemanda] = useState<
    Record<number, VisualizadorPorRegraResponse[]>
  >({});
  const [erroAcessoPorDemanda, setErroAcessoPorDemanda] = useState<Record<number, string>>({});
  const [novoAcessoCpfPorDemanda, setNovoAcessoCpfPorDemanda] = useState<Record<number, string>>({});
  const [salvandoAcessoId, setSalvandoAcessoId] = useState<number | null>(null);

  // Atribuir responsável (um ou mais funcionários) - mesmo padrão do acesso sigiloso
  // acima, só que sem restrição de perfil (qualquer funcionário do condomínio atribui).
  const [responsavelAberto, setResponsavelAberto] = useState<number | null>(null);
  const [responsaveisPorDemanda, setResponsaveisPorDemanda] = useState<Record<number, DemandaResponsavelResponse[]>>({});
  const [candidatosResponsavelPorDemanda, setCandidatosResponsavelPorDemanda] = useState<
    Record<number, CandidatoResponsavelResponse[]>
  >({});
  const [erroResponsavelPorDemanda, setErroResponsavelPorDemanda] = useState<Record<number, string>>({});
  const [novoResponsavelCpfPorDemanda, setNovoResponsavelCpfPorDemanda] = useState<Record<number, string>>({});
  const [salvandoResponsavelId, setSalvandoResponsavelId] = useState<number | null>(null);

  const [colunasKanban, setColunasKanban] = useState<StatusKanbanResponse[] | null>(null);
  // Mensagens rápidas do condomínio (pedido do Romulo) - combo pré-preenchida com a
  // primeira positiva/negativa nos painéis de decisão abaixo, ver `mensagensPositivas`/
  // `mensagensNegativas`.
  const [mensagensRapidas, setMensagensRapidas] = useState<MensagemRapidaResponse[] | null>(null);
  const [decisaoAberta, setDecisaoAberta] = useState<number | null>(null);
  // Qual dos três painéis está aberto pra `decisaoAberta` - "Aprovar de imediato" (combo de
  // mensagem positiva ou texto livre, sem Kanban), "Aprovar com Kanban" (formulário de
  // sempre) ou "Recusar" (combo de mensagem negativa ou texto livre).
  const [decisaoModo, setDecisaoModo] = useState<"imediato" | "kanban" | "recusar" | null>(null);
  const [colunaEscolhida, setColunaEscolhida] = useState("");
  const [comboAprovacaoId, setComboAprovacaoId] = useState("");
  const [justificativaAprovacao, setJustificativaAprovacao] = useState("");
  const [comboRecusaId, setComboRecusaId] = useState("");
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [salvandoDecisao, setSalvandoDecisao] = useState(false);
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);

  // Debounce da busca por descrição (400ms depois da última tecla) - reseta pra primeira
  // página dentro do próprio timeout, não num efeito separado reagindo a
  // `buscaEfetivaDescricao` (isso dispararia o lint `react-hooks/set-state-in-effect` -
  // setState síncrono dentro de efeito - mesmo cuidado já tomado em `condominios/page.tsx`).
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaEfetivaDescricao(buscaDescricao);
      setPaginaDemanda(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [buscaDescricao]);

  // Pedido do Romulo: as colunas do Kanban entraram como opção no filtro de status (ver
  // `<select>` mais abaixo) - por isso passou a carregar pros dois papéis, não só
  // funcionário (o endpoint já filtra a coluna oculta pro morador do lado do backend,
  // mesmo critério do quadro Kanban).
  useEffect(() => {
    if (!sessao || sessao.condominioId === null) return;
    listarStatusKanban(sessao.token, sessao.condominioId)
      .then(setColunasKanban)
      .catch(() => setColunasKanban([]));
  }, [sessao]);

  useEffect(() => {
    if (!sessao || sessao.tipoPapel !== "funcionario" || sessao.condominioId === null) return;
    listarMensagensRapidas(sessao.token, sessao.condominioId)
      .then(setMensagensRapidas)
      .catch(() => setMensagensRapidas([]));
  }, [sessao]);

  /** Mostra as etapas de uma demanda quando a linha é expandida (pedido do Romulo, v152:
   * antes carregava pra TODA demanda da lista assim que ela chegava - agora só quando o
   * usuário de fato clica pra ver aquela linha, mesmo padrão de `documentosPorDemanda`/
   * `notasPorDemanda` abaixo). Vale pros dois papéis (morador vê em modo leitura, ver
   * `mostraSecaoEtapas`). */
  useEffect(() => {
    if (!sessao || !demandas) return;
    const novas = demandas.filter((d) => expandidosIds.has(d.id) && !etapasCarregadasRef.current.has(d.id));
    novas.forEach((d) => {
      etapasCarregadasRef.current.add(d.id);
      listarEtapas(sessao.token, d.id)
        .then((dados) => {
          setEtapasPorDemanda((atual) => ({ ...atual, [d.id]: dados }));
        })
        .catch((err) => {
          etapasCarregadasRef.current.delete(d.id);
          setErroEtapasPorDemanda((atual) => ({
            ...atual,
            [d.id]: err instanceof Error ? err.message : "Falha ao carregar etapas.",
          }));
        });
    });
  }, [sessao, demandas, expandidosIds]);

  /** Mostra os anexos de uma demanda quando a linha é expandida (mesmo motivo de etapas
   * acima, v152) - vale pros dois papéis (morador também pode ter anexado foto ao abrir
   * a demanda, e continua podendo ver/remover as próprias). */
  useEffect(() => {
    if (!sessao || !demandas) return;
    const novas = demandas.filter((d) => expandidosIds.has(d.id) && !documentosCarregadosRef.current.has(d.id));
    novas.forEach((d) => {
      documentosCarregadosRef.current.add(d.id);
      listarDocumentosDemanda(sessao.token, d.id)
        .then((dados) => {
          setDocumentosPorDemanda((atual) => ({ ...atual, [d.id]: dados }));
        })
        .catch((err) => {
          documentosCarregadosRef.current.delete(d.id);
          setErroDocumentosPorDemanda((atual) => ({
            ...atual,
            [d.id]: err instanceof Error ? err.message : "Falha ao carregar anexos.",
          }));
        });
    });
  }, [sessao, demandas, expandidosIds]);

  /** Mostra as notas de uma demanda quando a linha é expandida - mesmo motivo de
   * `documentosPorDemanda` acima (v152), pros dois papéis. */
  useEffect(() => {
    if (!sessao || !demandas) return;
    const novas = demandas.filter((d) => expandidosIds.has(d.id) && !notasCarregadasRef.current.has(d.id));
    novas.forEach((d) => {
      notasCarregadasRef.current.add(d.id);
      listarNotasDemanda(sessao.token, d.id)
        .then((dados) => {
          setNotasPorDemanda((atual) => ({ ...atual, [d.id]: dados }));
        })
        .catch((err) => {
          notasCarregadasRef.current.delete(d.id);
          setErroNotasPorDemanda((atual) => ({
            ...atual,
            [d.id]: err instanceof Error ? err.message : "Falha ao carregar notas.",
          }));
        });
    });
  }, [sessao, demandas, expandidosIds]);

  // Pendente por padrão pra funcionário (foco no que ainda precisa de decisão); Todos
  // por padrão pra morador (a lista já é só das próprias demandas, menor).
  const filtroStatusEfetivo = filtroStatus ?? (sessao?.tipoPapel === "funcionario" ? "pendente" : "");

  /** Refaz a busca paginada com os filtros atuais - além do fetch de carga normal
   * (useEffect abaixo), reaproveitada depois de criar/aprovar/reprovar/alternar sigilo de
   * uma demanda (ver os handlers mais abaixo), porque com paginação de verdade um
   * patch local no array (como a tela fazia antes) pode deixar a lista inconsistente com
   * o filtro ativo (ex: aprovar uma demanda enquanto o filtro é "Pendente" - ela precisa
   * SUMIR da lista, não só mudar de status na tela). Aceita a página como parâmetro (em
   * vez de sempre ler `paginaDemanda`) pra quem também acabou de mudar a página no mesmo
   * gesto (ex: `handleCriar`, que quer voltar pra primeira página) - `setPaginaDemanda`
   * não vale na hora dentro da mesma função (é assíncrono), então ler o estado aqui
   * pegaria o valor antigo. */
  function recarregarPaginaDemandas(pagina = paginaDemanda) {
    if (!sessao) return;
    listarPaginaDemandas(sessao.token, {
      busca: buscaEfetivaDescricao,
      status: filtroStatusEfetivo || undefined,
      notaNaoLida: filtroNotaNaoLida,
      etapaVencida: filtroEtapaVencida,
      pagina,
    })
      .then((resultado) => {
        setDemandas(resultado.itens);
        setTotalPaginasDemanda(resultado.totalPaginas);
        setTotalItensDemanda(resultado.totalItens);
        setExisteNotaNaoLida(resultado.existeNotaNaoLida);
        setExisteEtapaVencida(resultado.existeEtapaVencida);
      })
      .catch((err) => setErroLista(err instanceof Error ? err.message : "Falha ao carregar."));
  }

  useEffect(() => {
    if (!sessao) return;
    let cancelado = false;
    listarPaginaDemandas(sessao.token, {
      busca: buscaEfetivaDescricao,
      status: filtroStatusEfetivo || undefined,
      notaNaoLida: filtroNotaNaoLida,
      etapaVencida: filtroEtapaVencida,
      pagina: paginaDemanda,
    })
      .then((resultado) => {
        if (cancelado) return;
        setDemandas(resultado.itens);
        setTotalPaginasDemanda(resultado.totalPaginas);
        setTotalItensDemanda(resultado.totalItens);
        setExisteNotaNaoLida(resultado.existeNotaNaoLida);
        setExisteEtapaVencida(resultado.existeEtapaVencida);
        setErroLista(null);
      })
      .catch((err) => {
        if (!cancelado) setErroLista(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, buscaEfetivaDescricao, filtroStatusEfetivo, filtroNotaNaoLida, filtroEtapaVencida, paginaDemanda]);

  // `listarMensagensRapidas` devolve mais recente primeiro (ver MensagemRapidaRepository) -
  // aqui inverte pra mais antiga primeiro, porque a combo dos painéis de decisão abaixo
  // precisa vir pré-preenchida com "a primeira mensagem cadastrada" (pedido do Romulo).
  const mensagensPositivas = useMemo(
    () =>
      (mensagensRapidas ?? [])
        .filter((m) => m.carater === "positivo")
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [mensagensRapidas],
  );
  const mensagensNegativas = useMemo(
    () =>
      (mensagensRapidas ?? [])
        .filter((m) => m.carater === "negativo")
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [mensagensRapidas],
  );

  if (!sessao) return null;

  const podeVerEtapas = sessao.tipoPapel === "funcionario";

  function formEtapa(demandaId: number) {
    return etapaFormPorDemanda[demandaId] ?? { nome: "", prazo: "" };
  }

  /** Pedido do Romulo: "Etapas"/"Imagens" só viram link quando não há registro nenhum
   * ainda (ou enquanto carrega, não decide nada) - usado tanto pra saber se mostra o link
   * quanto pra saber se ainda mostra a seção cheia (`etapasEscondida` cobre o caso raro de
   * demanda reprovada e sem etapa nenhuma - não ganha nem o link, não dá mais pra criar). */
  function etapasSoLink(d: DemandaResponse): boolean {
    return (
      podeVerEtapas &&
      etapasPorDemanda[d.id] !== undefined &&
      etapasPorDemanda[d.id].length === 0 &&
      !etapasAbertoPorDemanda[d.id] &&
      d.statusAprovacao !== "reprovada"
    );
  }

  function etapasEscondida(d: DemandaResponse): boolean {
    return (
      podeVerEtapas &&
      etapasPorDemanda[d.id] !== undefined &&
      etapasPorDemanda[d.id].length === 0 &&
      d.statusAprovacao === "reprovada"
    );
  }

  function imagensSoLink(d: DemandaResponse): boolean {
    return (documentosPorDemanda[d.id] ?? []).length === 0 && !imagensAbertoPorDemanda[d.id];
  }

  /** Pedido do Romulo: morador vê a seção de etapas em modo só-leitura (nome + prazo, sem
   * formulário de cadastro nem checkbox de concluir) - mas só quando já existe pelo menos
   * uma etapa (sem link "Adicionar etapa" pra ele, já que não pode criar nenhuma). */
  function mostraSecaoEtapas(d: DemandaResponse): boolean {
    if (podeVerEtapas) return !etapasSoLink(d) && !etapasEscondida(d);
    return (etapasPorDemanda[d.id]?.length ?? 0) > 0;
  }

  async function handleCriarEtapa(e: React.FormEvent, demandaId: number) {
    e.preventDefault();
    if (!sessao) return;
    const form = formEtapa(demandaId);
    setErroEtapasPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    setSalvandoEtapaId(demandaId);
    try {
      const nova = await criarEtapa(sessao.token, { demandaId, nome: form.nome, prazo: form.prazo || null });
      setEtapasPorDemanda((atual) => ({ ...atual, [demandaId]: [...(atual[demandaId] ?? []), nova] }));
      setEtapaFormPorDemanda((atual) => ({ ...atual, [demandaId]: { nome: "", prazo: "" } }));
      // Avisa o ícone de alerta do menu (componente separado, sem isso só reconferiria no
      // próximo minuto do intervalo - ver `EVENTO_ALERTAS_DEMANDAS` em `app-shell.tsx`).
      window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
    } catch (err) {
      setErroEtapasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao cadastrar etapa.",
      }));
    } finally {
      setSalvandoEtapaId(null);
    }
  }

  async function handleAlternarConcluida(etapaId: number, demandaId: number) {
    if (!sessao) return;
    try {
      const atualizada = await alternarConcluidaEtapa(sessao.token, etapaId);
      setEtapasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: (atual[demandaId] ?? []).map((et) => (et.id === etapaId ? atualizada : et)),
      }));
      window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
    } catch (err) {
      setErroEtapasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao atualizar etapa.",
      }));
    }
  }

  /** Abre um dos três painéis de decisão pra uma demanda (pedido do Romulo: três links em
   * vez de um só) - clicar de novo no mesmo link fecha. Cada abertura já vem com a combo de
   * mensagem pré-preenchida com a primeira cadastrada (positiva pra "imediato", negativa
   * pra "recusar") e os campos livres limpos. */
  function abrirDecisao(demandaId: number, modo: "imediato" | "kanban" | "recusar") {
    const abrindo = !(decisaoAberta === demandaId && decisaoModo === modo);
    setDecisaoAberta(abrindo ? demandaId : null);
    setDecisaoModo(abrindo ? modo : null);
    setColunaEscolhida(colunasKanban && colunasKanban.length > 0 ? String(colunasKanban[0].id) : "");
    setComboAprovacaoId(mensagensPositivas.length > 0 ? String(mensagensPositivas[0].id) : "");
    setJustificativaAprovacao("");
    setComboRecusaId(mensagensNegativas.length > 0 ? String(mensagensNegativas[0].id) : "");
    setMotivoReprovacao("");
    setErroDecisao(null);
  }

  /** "Aprovar de imediato" (pedido do Romulo): sem Kanban, com a justificativa vindo da
   * combo de mensagem positiva - texto livre tem prioridade quando preenchido. */
  async function handleAprovarImediato(demandaId: number) {
    if (!sessao) return;
    const mensagem = mensagensPositivas.find((m) => String(m.id) === comboAprovacaoId);
    const justificativa = justificativaAprovacao.trim() || mensagem?.texto || "";
    if (!justificativa) {
      setErroDecisao("Escolha uma mensagem ou digite uma justificativa.");
      return;
    }
    setErroDecisao(null);
    setSalvandoDecisao(true);
    try {
      await aprovarDemanda(sessao.token, demandaId, { justificativa });
      // Paginação de verdade (v155): um patch local não dá mais conta - aprovar pode
      // tirar a demanda do filtro ativo (ex: filtro "Pendente"), então precisa recarregar
      // a página pra lista ficar consistente com o filtro.
      recarregarPaginaDemandas();
      setDecisaoAberta(null);
      setDecisaoModo(null);
    } catch (err) {
      setErroDecisao(err instanceof Error ? err.message : "Falha ao aprovar demanda.");
    } finally {
      setSalvandoDecisao(false);
    }
  }

  /** "Aprovar com Kanban": formulário de sempre, manda pra uma coluna. */
  async function handleAprovarComKanban(demandaId: number) {
    if (!sessao) return;
    if (!colunaEscolhida) {
      setErroDecisao("Escolha uma coluna do Kanban.");
      return;
    }
    setErroDecisao(null);
    setSalvandoDecisao(true);
    try {
      await aprovarDemanda(sessao.token, demandaId, { statusKanbanId: Number(colunaEscolhida) });
      // Mesmo motivo de `handleAprovarImediato` acima.
      recarregarPaginaDemandas();
      setDecisaoAberta(null);
      setDecisaoModo(null);
    } catch (err) {
      setErroDecisao(err instanceof Error ? err.message : "Falha ao aprovar demanda.");
    } finally {
      setSalvandoDecisao(false);
    }
  }

  /** "Recusar": justificativa vindo da combo de mensagem negativa - texto livre tem
   * prioridade quando preenchido, mesmo espírito de `handleAprovarImediato`. */
  async function handleReprovar(demandaId: number) {
    if (!sessao) return;
    const mensagem = mensagensNegativas.find((m) => String(m.id) === comboRecusaId);
    const motivo = motivoReprovacao.trim() || mensagem?.texto || "";
    if (!motivo) {
      setErroDecisao("Escolha uma mensagem ou digite o motivo da recusa.");
      return;
    }
    setErroDecisao(null);
    setSalvandoDecisao(true);
    try {
      await reprovarDemanda(sessao.token, demandaId, { justificativa: motivo });
      // Mesmo motivo de `handleAprovarImediato` acima.
      recarregarPaginaDemandas();
      setDecisaoAberta(null);
      setDecisaoModo(null);
    } catch (err) {
      setErroDecisao(err instanceof Error ? err.message : "Falha ao recusar demanda.");
    } finally {
      setSalvandoDecisao(false);
    }
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setErroForm(null);
    setSalvando(true);
    try {
      const nova = await criarDemanda(sessao.token, {
        titulo: campos.titulo,
        descricao: campos.descricao,
        sigilosa: campos.sigilosa,
        identificarSolicitante: campos.identificarSolicitante ?? sessao.tipoPapel === "funcionario",
      });
      setCampos(FORM_VAZIO);
      // A demanda já nasceu - as imagens só têm onde subir depois disso (o upload
      // exige um demandaId real, ver DemandaDocumentoController). Uma falha aqui não
      // desfaz a demanda: ela já foi criada, só o(s) anexo(s) que não entraram.
      let semFalhaDeImagem = true;
      if (imagensNovas.length > 0) {
        documentosCarregadosRef.current.add(nova.id);
        const resultados = await Promise.allSettled(
          imagensNovas.map((arquivo) => uploadDocumentoDemanda(sessao.token, nova.id, arquivo)),
        );
        const enviados = resultados
          .filter((r): r is PromiseFulfilledResult<DemandaDocumentoResponse> => r.status === "fulfilled")
          .map((r) => r.value);
        setDocumentosPorDemanda((atual) => ({ ...atual, [nova.id]: enviados }));
        setImagensNovas([]);
        const falhas = resultados.filter((r) => r.status === "rejected").length;
        if (falhas > 0) {
          semFalhaDeImagem = false;
          setErroForm(`Demanda cadastrada, mas ${falhas} imagem(ns) não subiu(ram) - tente anexar de novo.`);
        }
      }
      // Fecha o agrupador de volta pra listagem (pedido do Romulo) - só quando deu tudo
      // certo, senão o erro acima ficaria escondido junto com o formulário.
      if (semFalhaDeImagem) {
        setFormNovaDemandaAberto(false);
      }
      // Volta pra primeira página (ordenada por mais recente primeiro, a demanda nova
      // sempre cai ali) e recarrega - local-append não serve mais com paginação de
      // verdade (ver `recarregarPaginaDemandas`).
      setPaginaDemanda(0);
      recarregarPaginaDemandas(0);
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Falha ao cadastrar demanda.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemoverDocumento(demandaId: number, documentoId: number) {
    if (!sessao) return;
    try {
      await removerDocumentoDemanda(sessao.token, documentoId);
      setDocumentosPorDemanda((atual) => ({
        ...atual,
        [demandaId]: (atual[demandaId] ?? []).filter((doc) => doc.id !== documentoId),
      }));
    } catch (err) {
      setErroDocumentosPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao remover anexo.",
      }));
    }
  }

  /** Anexar mais imagens numa demanda que já existe, direto na listagem - diferente do
   * upload no formulário de cadastro (que só sobe depois de "Cadastrar"), aqui a demanda
   * já tem id, então cada imagem sobe assim que é escolhida (ver AdicionarAnexoBotao). */
  async function handleAdicionarDocumento(demandaId: number, arquivo: File) {
    if (!sessao) return;
    setErroDocumentosPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    const novo = await uploadDocumentoDemanda(sessao.token, demandaId, arquivo);
    setDocumentosPorDemanda((atual) => ({ ...atual, [demandaId]: [...(atual[demandaId] ?? []), novo] }));
  }

  function formNota(demandaId: number): string {
    return novaNotaPorDemanda[demandaId] ?? "";
  }

  /** Cadastra uma pergunta nova (nota raiz, sem `notaPaiId`) - morador ou funcionário. */
  async function handleCriarNota(e: React.FormEvent, demandaId: number) {
    e.preventDefault();
    if (!sessao) return;
    setErroNotasPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    setSalvandoNovaNotaId(demandaId);
    try {
      const nova = await criarNotaDemanda(sessao.token, { demandaId, texto: formNota(demandaId) });
      setNotasPorDemanda((atual) => ({ ...atual, [demandaId]: [...(atual[demandaId] ?? []), nova] }));
      setNovaNotaPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
      window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
    } catch (err) {
      setErroNotasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao cadastrar nota.",
      }));
    } finally {
      setSalvandoNovaNotaId(null);
    }
  }

  function abrirResposta(notaId: number) {
    setRespostaAberta((atual) => (atual === notaId ? null : notaId));
    setTextoResposta("");
  }

  /** Responde a uma nota (pedido do Romulo) - quando quem responde é funcionário, o
   * backend já marca a nota-pai como lida na mesma tacada, por isso o refetch da lista
   * inteira em vez de só anexar a resposta nova (pega esse efeito colateral também). */
  async function handleResponderNota(e: React.FormEvent, demandaId: number, notaPaiId: number) {
    e.preventDefault();
    if (!sessao) return;
    setErroRespostaPorNota((atual) => ({ ...atual, [notaPaiId]: "" }));
    setSalvandoRespostaId(notaPaiId);
    try {
      await criarNotaDemanda(sessao.token, { demandaId, notaPaiId, texto: textoResposta });
      const atualizadas = await listarNotasDemanda(sessao.token, demandaId);
      setNotasPorDemanda((atual) => ({ ...atual, [demandaId]: atualizadas }));
      window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
      setRespostaAberta(null);
      setTextoResposta("");
    } catch (err) {
      setErroRespostaPorNota((atual) => ({
        ...atual,
        [notaPaiId]: err instanceof Error ? err.message : "Falha ao responder.",
      }));
    } finally {
      setSalvandoRespostaId(null);
    }
  }

  /** Só funcionário (pedido do Romulo) - responder a uma nota também marca ela como lida,
   * ver `handleResponderNota`/backend. */
  async function handleMarcarNotaLida(demandaId: number, notaId: number) {
    if (!sessao) return;
    setMarcandoLidaId(notaId);
    try {
      const atualizada = await marcarNotaLida(sessao.token, notaId);
      setNotasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: (atual[demandaId] ?? []).map((n) => (n.id === notaId ? atualizada : n)),
      }));
      window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
    } catch (err) {
      setErroNotasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao marcar como lida.",
      }));
    } finally {
      setMarcandoLidaId(null);
    }
  }

  /** Uma nota da árvore (raiz ou resposta) + suas respostas, recursivamente - `profundidade`
   * cresce a cada nível de resposta e vira a indentação (pedido do Romulo: "nota respondida
   * fica indentada em relação a nota original"). `nota.podeResponder` já vem calculado pelo
   * backend (pedido do Romulo: quem abriu a nota não pode responder a ela mesma). */
  function renderNota(demanda: DemandaResponse, nota: DemandaNotaResponse, todas: DemandaNotaResponse[], profundidade: number) {
    const filhas = todas.filter((n) => n.notaPaiId === nota.id);
    const podeMarcarLida = sessao?.tipoPapel === "funcionario";
    return (
      <div key={nota.id} style={{ marginLeft: profundidade * 20 }} className="mt-2">
        <div
          className={`rounded-lg border bg-white p-2.5 ${
            /* Destaque laranja pra nota não lida (pedido do Romulo) - tem prioridade
               visual sobre o traço de indentação de resposta (border-l-2). */
            !nota.lida
              ? "border-2 border-orange-400"
              : profundidade > 0
                ? "border-l-2 border-slate-300"
                : "border-slate-200"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-slate-800">{nota.texto}</p>
            {podeMarcarLida && (
              <button
                type="button"
                onClick={() => handleMarcarNotaLida(demanda.id, nota.id)}
                title={nota.lida ? "Lida" : "Marcar como lida"}
                disabled={nota.lida || marcandoLidaId === nota.id}
                className={`shrink-0 disabled:cursor-default ${
                  nota.lida ? "text-emerald-600" : "text-slate-400 hover:text-emerald-600"
                }`}
              >
                <IconeNotaLida className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-xs italic text-slate-400">
            {nota.autorNome} ({nota.autorTipo === "morador" ? "morador" : "funcionário"}) em{" "}
            {new Date(nota.createdAt).toLocaleString("pt-BR")}
            {nota.lida && " · lida"}
          </p>
          {nota.podeResponder && (
            <button
              type="button"
              onClick={() => abrirResposta(nota.id)}
              className="mt-1 text-xs font-medium text-blue-600 hover:underline"
            >
              {respostaAberta === nota.id ? "Cancelar" : "Responder"}
            </button>
          )}
          {respostaAberta === nota.id && (
            <form onSubmit={(e) => handleResponderNota(e, demanda.id, nota.id)} className="mt-2 flex gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  required
                  maxLength={150}
                  placeholder="Escreva uma resposta"
                  value={textoResposta}
                  onChange={(e) => setTextoResposta(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={salvandoRespostaId === nota.id}>
                {salvandoRespostaId === nota.id ? "Enviando..." : "Responder"}
              </Button>
            </form>
          )}
          {erroRespostaPorNota[nota.id] && <p className="mt-1 text-xs text-red-600">{erroRespostaPorNota[nota.id]}</p>}
        </div>
        {filhas.map((filha) => renderNota(demanda, filha, todas, profundidade + 1))}
      </div>
    );
  }

  async function handleAlternarSigilo(demandaId: number) {
    if (!sessao) return;
    setErroSigiloPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    try {
      await alternarSigiloDemanda(sessao.token, demandaId);
      // Mesmo motivo de `handleAprovarImediato` - com paginação de verdade, recarregar a
      // página é mais seguro que um patch local (mesmo que sigilo em si não mude o filtro
      // de status, mantém tudo consistente do mesmo jeito).
      recarregarPaginaDemandas();
    } catch (err) {
      setErroSigiloPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao atualizar sigilo.",
      }));
    }
  }

  function alternarAcessoSigilo(demandaId: number) {
    const abrindo = acessoSigiloAberto !== demandaId;
    setAcessoSigiloAberto(abrindo ? demandaId : null);
    setErroAcessoPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    if (!abrindo || !sessao) return;

    if (!acessosPorDemanda[demandaId]) {
      listarAcessoSigiloso(sessao.token, demandaId)
        .then((lista) => setAcessosPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) =>
          setErroAcessoPorDemanda((atual) => ({
            ...atual,
            [demandaId]: err instanceof Error ? err.message : "Falha ao carregar quem tem acesso.",
          })),
        );
    }
    // Alimenta a combo de busca (ComboPessoa) - todo mundo ativo no condomínio.
    if (!candidatosAcessoPorDemanda[demandaId]) {
      listarCandidatosAcesso(sessao.token, demandaId)
        .then((lista) => setCandidatosAcessoPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) =>
          setErroAcessoPorDemanda((atual) => ({
            ...atual,
            [demandaId]: err instanceof Error ? err.message : "Falha ao carregar as pessoas do condomínio.",
          })),
        );
    }
    if (!visualizadoresPorRegraPorDemanda[demandaId]) {
      listarVisualizacaoPorRegra(sessao.token, demandaId)
        .then((lista) => setVisualizadoresPorRegraPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) =>
          setErroAcessoPorDemanda((atual) => ({
            ...atual,
            [demandaId]: err instanceof Error ? err.message : "Falha ao carregar quem vê por padrão.",
          })),
        );
    }
  }

  async function handleConcederAcesso(e: React.FormEvent, demandaId: number) {
    e.preventDefault();
    if (!sessao) return;
    const cpf = novoAcessoCpfPorDemanda[demandaId] ?? "";
    if (!cpf) {
      setErroAcessoPorDemanda((atual) => ({ ...atual, [demandaId]: "Escolha alguém na busca antes de conceder." }));
      return;
    }
    setErroAcessoPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    setSalvandoAcessoId(demandaId);
    try {
      const concedidos = await concederAcessoSigiloso(sessao.token, demandaId, apenasDigitos(cpf));
      setAcessosPorDemanda((atual) => ({ ...atual, [demandaId]: [...(atual[demandaId] ?? []), ...concedidos] }));
      setNovoAcessoCpfPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    } catch (err) {
      setErroAcessoPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao conceder acesso.",
      }));
    } finally {
      setSalvandoAcessoId(null);
    }
  }

  async function handleRevogarAcesso(demandaId: number, acessoId: number) {
    if (!sessao) return;
    setErroAcessoPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    try {
      await revogarAcessoSigiloso(sessao.token, demandaId, acessoId);
      setAcessosPorDemanda((atual) => ({
        ...atual,
        [demandaId]: (atual[demandaId] ?? []).filter((a) => a.id !== acessoId),
      }));
    } catch (err) {
      setErroAcessoPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao revogar acesso.",
      }));
    }
  }

  function alternarResponsaveis(demandaId: number) {
    const abrindo = responsavelAberto !== demandaId;
    setResponsavelAberto(abrindo ? demandaId : null);
    setErroResponsavelPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    if (!abrindo || !sessao) return;

    if (!responsaveisPorDemanda[demandaId]) {
      listarResponsaveis(sessao.token, demandaId)
        .then((lista) => setResponsaveisPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) =>
          setErroResponsavelPorDemanda((atual) => ({
            ...atual,
            [demandaId]: err instanceof Error ? err.message : "Falha ao carregar responsáveis.",
          })),
        );
    }
    // Alimenta a combo de busca (ComboFuncionario) - funcionários ativos do condomínio.
    if (!candidatosResponsavelPorDemanda[demandaId]) {
      listarCandidatosResponsavel(sessao.token, demandaId)
        .then((lista) => setCandidatosResponsavelPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) =>
          setErroResponsavelPorDemanda((atual) => ({
            ...atual,
            [demandaId]: err instanceof Error ? err.message : "Falha ao carregar os funcionários do condomínio.",
          })),
        );
    }
  }

  async function handleAtribuirResponsavel(e: React.FormEvent, demandaId: number) {
    e.preventDefault();
    if (!sessao) return;
    const cpf = novoResponsavelCpfPorDemanda[demandaId] ?? "";
    if (!cpf) {
      setErroResponsavelPorDemanda((atual) => ({
        ...atual,
        [demandaId]: "Escolha alguém na busca antes de atribuir.",
      }));
      return;
    }
    setErroResponsavelPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    setSalvandoResponsavelId(demandaId);
    try {
      const atribuido = await atribuirResponsavel(sessao.token, demandaId, apenasDigitos(cpf));
      setResponsaveisPorDemanda((atual) => ({ ...atual, [demandaId]: [...(atual[demandaId] ?? []), atribuido] }));
      setNovoResponsavelCpfPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    } catch (err) {
      setErroResponsavelPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao atribuir responsável.",
      }));
    } finally {
      setSalvandoResponsavelId(null);
    }
  }

  async function handleRemoverResponsavel(demandaId: number, atribuicaoId: number) {
    if (!sessao) return;
    setErroResponsavelPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    try {
      await removerResponsavel(sessao.token, demandaId, atribuicaoId);
      setResponsaveisPorDemanda((atual) => ({
        ...atual,
        [demandaId]: (atual[demandaId] ?? []).filter((r) => r.id !== atribuicaoId),
      }));
    } catch (err) {
      setErroResponsavelPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao remover responsável.",
      }));
    }
  }

  return (
    <AppShell sessao={sessao}>
      <h1 className="text-center text-xl font-semibold text-slate-900">
        Demandas{sessao.condominioNome ? ` — ${sessao.condominioNome}` : ""}
      </h1>

      {/* Formulário de cadastro dentro de um agrupador fechado por padrão (pedido do
          Romulo: dar foco na listagem) - só abre quem clicar em "+ Nova demanda". */}
      {!formNovaDemandaAberto ? (
        <div className="mt-6 flex justify-start">
          <Button type="button" onClick={() => setFormNovaDemandaAberto(true)}>
            + Nova demanda
          </Button>
        </div>
      ) : (
        <form onSubmit={handleCriar} className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Nova demanda</p>
            <button
              type="button"
              onClick={() => setFormNovaDemandaAberto(false)}
              title="Fechar"
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          <Input
            required
            placeholder="Título"
            value={campos.titulo}
            onChange={(e) => setCampos((c) => ({ ...c, titulo: e.target.value }))}
          />
          <MarkdownEditor
            required
            placeholder="Descrição"
            value={campos.descricao}
            onChange={(descricao) => setCampos((c) => ({ ...c, descricao }))}
            rows={6}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={campos.sigilosa}
              onChange={(e) => setCampos((c) => ({ ...c, sigilosa: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Demanda sigilosa
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={campos.identificarSolicitante ?? sessao.tipoPapel === "funcionario"}
              onChange={(e) => setCampos((c) => ({ ...c, identificarSolicitante: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Mostrar meu nome pros funcionários (aparece em &quot;Aberta por&quot;)
          </label>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              Imagens e vídeo (opcional)
            </p>
            <UploadImagens arquivos={imagensNovas} onChange={setImagensNovas} />
          </div>

          {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : "Cadastrar"}
            </Button>
          </div>
        </form>
      )}

      <div className="mt-4 flex gap-3">
        <Input
          placeholder="Buscar por descrição"
          value={buscaDescricao}
          onChange={(e) => setBuscaDescricao(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={filtroStatusEfetivo}
          onChange={(e) => {
            setFiltroStatus(e.target.value);
            setPaginaDemanda(0);
          }}
          className="rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os status</option>
          <optgroup label="Status de aprovação">
            {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </optgroup>
          {/* Pedido do Romulo: filtrar também por situação do Kanban, no mesmo campo -
              "kanban:<id>" pra não colidir com os valores de status de aprovação (o
              backend distingue os dois, ver `DemandaService.listarPagina`). Só aparece
              quando o condomínio já tem coluna cadastrada. */}
          {colunasKanban && colunasKanban.length > 0 && (
            <optgroup label="Situação no Kanban">
              {colunasKanban.map((c) => (
                <option key={c.id} value={`kanban:${c.id}`}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {/* Filtro em forma de ícone (pedido do Romulo): só demandas com nota ainda não
            lida. Alterna igual um checkbox - fundo/contorno laranja quando ativo. Fica com
            o traço em âmbar mesmo desativado quando existe alguma nota não lida em algum
            lugar (`existeNotaNaoLida`) - aviso ambiente, mesmo espírito do sininho de
            tarefas (`temHoje`), antes de precisar clicar pra descobrir. */}
        <button
          type="button"
          onClick={() => {
            setFiltroNotaNaoLida((atual) => {
              const ativando = !atual;
              // Nota costuma estar numa demanda já decidida - sem isso, o filtro "E" com o
              // status "Pendente" (padrão pro funcionário) quase sempre dava lista vazia,
              // parecendo quebrado. Reseta pra "Todos" só ao ATIVAR, pra ficar visível.
              if (ativando) setFiltroStatus("");
              return ativando;
            });
            setPaginaDemanda(0);
          }}
          title={
            filtroNotaNaoLida
              ? "Mostrando só demandas com nota não lida - clique pra desativar"
              : existeNotaNaoLida
                ? "Tem demanda com nota não lida - clique pra filtrar"
                : "Filtrar demandas com nota não lida"
          }
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
            filtroNotaNaoLida
              ? "border-orange-400 bg-orange-50 text-orange-600"
              : existeNotaNaoLida
                ? "border-transparent bg-slate-100 text-orange-500 hover:text-orange-600"
                : "border-transparent bg-slate-100 text-slate-400 hover:text-slate-600"
          }`}
        >
          <IconeNotaPendente className="h-5 w-5" />
        </button>
        {/* Mesmo padrão do filtro de nota acima, agora pra etapa com prazo vencido e
            ainda aberta (pedido do Romulo: "um reloginho, sendo vermelho com atraso ou
            cinza quando estiver no prazo ou não tiver prazo") - etapa é informação
            interna, então só funcionário vê esse ícone (mesmo escopo de `podeVerEtapas`). */}
        {podeVerEtapas && (
          <button
            type="button"
            onClick={() => {
              setFiltroEtapaVencida((atual) => {
                const ativando = !atual;
                if (ativando) setFiltroStatus("");
                return ativando;
              });
              setPaginaDemanda(0);
            }}
            title={
              filtroEtapaVencida
                ? "Mostrando só demandas com etapa em atraso - clique pra desativar"
                : existeEtapaVencida
                  ? "Tem demanda com etapa em atraso - clique pra filtrar"
                  : "Filtrar demandas com etapa em atraso"
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
              filtroEtapaVencida
                ? "border-red-400 bg-red-50 text-red-600"
                : existeEtapaVencida
                  ? "border-transparent bg-slate-100 text-red-500 hover:text-red-600"
                  : "border-transparent bg-slate-100 text-slate-400 hover:text-slate-600"
            }`}
          >
            <IconeRelogio className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Demandas
        </div>

        {erroLista && <p className="p-4 text-sm text-red-600">{erroLista}</p>}
        {demandas === null && !erroLista && <p className="p-4 text-sm text-slate-500">Carregando...</p>}
        {demandas?.length === 0 && (
          <p className="p-4 text-sm text-slate-500">
            {/* `filtroStatus === null` é o padrão (Pendente pra funcionário/Todos pra
                morador), não uma escolha visível da pessoa - só conta como "filtro ativo"
                pra essa mensagem quando ela mexeu em algo de propósito. */}
            {!buscaEfetivaDescricao && filtroStatus === null && !filtroNotaNaoLida && !filtroEtapaVencida
              ? "Nenhuma demanda cadastrada ainda."
              : "Nenhuma demanda bate com esse filtro."}
          </p>
        )}

        {demandas && demandas.length > 0 && (
          <div className="divide-y divide-slate-100">
            {demandas.map((d) => {
              const expandida = expandidosIds.has(d.id);
              return (
              <div key={d.id} className="p-4">
                {/* Colapsada por padrão (pedido do Romulo): só título e status ficam
                    sempre visíveis - o resto (descrição, ações, etapas/imagens/notas)
                    só renderiza (e só busca da API) quando a linha é expandida.
                    Virou `div` (não `button`) porque agora tem o botão de copiar título
                    lá dentro - botão dentro de botão é HTML inválido; `role="button"` +
                    `onKeyDown` mantêm a mesma acessibilidade de antes. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => alternarExpandido(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      alternarExpandido(d.id);
                    }
                  }}
                  className="flex w-full cursor-pointer items-start justify-between gap-3 text-left"
                >
                  <p
                    className={`flex items-center text-sm font-medium ${
                      d.sigilosa ? "italic text-red-600" : "text-slate-900"
                    }`}
                  >
                    <span
                      className={`mr-1.5 font-mono text-xs font-normal ${
                        d.sigilosa ? "italic text-red-600" : "text-slate-400"
                      }`}
                    >
                      #{d.id}
                    </span>
                    {d.titulo}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopiarTitulo(d);
                      }}
                      title={tituloCopiadoId === d.id ? "Copiado!" : 'Copiar "#N - Título"'}
                      className={`ml-1.5 shrink-0 ${
                        tituloCopiadoId === d.id ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      <IconeCopiar className="h-3.5 w-3.5" />
                    </button>
                    {d.sigilosa && <span className="ml-1.5 text-xs font-normal text-slate-400">(sigilosa)</span>}
                  </p>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASSES[d.statusAprovacao]}`}>
                      {STATUS_LABEL[d.statusAprovacao]}
                    </span>
                    <span className={`text-slate-400 transition-transform ${expandida ? "rotate-180" : ""}`}>▾</span>
                  </span>
                </div>

                {expandida && (
                  <>
                <Markdown texto={d.descricao} className="mt-2 text-sm text-slate-600" />
                <p className="mt-2 text-xs italic text-slate-400">
                  Aberta por {d.identificarSolicitante ? d.solicitanteNome : "Anônimo"} (
                  {d.solicitanteTipo === "morador" ? "morador" : "funcionário"}) em {formatarData(d.createdAt)}
                  {d.statusKanbanNome && (
                    <>
                      {" "}
                      · <strong className="font-semibold not-italic text-slate-600">{d.statusKanbanNome}</strong>
                    </>
                  )}
                  {d.funcionarioResponsavelNome && <> · responsável: {d.funcionarioResponsavelNome}</>}
                </p>
                {d.statusAprovacao !== "pendente" && d.funcionarioAprovadorNome && (
                  <p className="mt-1 text-xs italic text-slate-400">
                    {d.statusAprovacao === "aprovada" ? "Aprovada" : "Recusada"} por {d.funcionarioAprovadorNome}
                    {d.dataAprovacao && <> em {formatarData(d.dataAprovacao)}</>}
                    {d.statusAprovacao === "reprovada" && d.justificativaReprovacao && (
                      <>: <strong className="font-semibold not-italic text-slate-600">{d.justificativaReprovacao}</strong></>
                    )}
                    {d.statusAprovacao === "aprovada" && d.justificativaAprovacao && (
                      <>: <strong className="font-semibold not-italic text-slate-600">{d.justificativaAprovacao}</strong></>
                    )}
                  </p>
                )}

                {d.sigilosa && d.podeGerenciarSigilo && acessoSigiloAberto === d.id && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {/* Quem já vê por REGRA (síndico/sub-síndico) - informativo, sem "✕"
                        de remover (diferente da lista de concessão explícita abaixo).
                        Pedido do Romulo: "quem tem acesso ao card já sabe quem também
                        está vendo". */}
                    {visualizadoresPorRegraPorDemanda[d.id] && visualizadoresPorRegraPorDemanda[d.id].length > 0 && (
                      <div className="mb-3 border-b border-slate-200 pb-3">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                          Já veem por padrão
                        </p>
                        <ul className="space-y-1">
                          {visualizadoresPorRegraPorDemanda[d.id].map((v, i) => (
                            <li key={i} className="text-sm text-slate-700">
                              {v.nome} <span className="text-xs text-slate-400">({PERFIL_LABEL[v.perfil]})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Quem mais pode ver essa demanda sigilosa
                    </p>

                    {!acessosPorDemanda[d.id] && !erroAcessoPorDemanda[d.id] && (
                      <p className="text-sm text-slate-500">Carregando...</p>
                    )}
                    {acessosPorDemanda[d.id]?.length === 0 && (
                      <p className="text-sm text-slate-500">Ninguém foi indicado ainda.</p>
                    )}
                    {acessosPorDemanda[d.id] && acessosPorDemanda[d.id].length > 0 && (
                      <ul className="mb-3 space-y-1">
                        {acessosPorDemanda[d.id].map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                            <span>
                              {a.nome}{" "}
                              <span className="text-xs text-slate-400">
                                ({a.tipoPessoa === "morador" ? "morador" : "funcionário"})
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRevogarAcesso(d.id, a.id)}
                              title="Remover"
                              className="text-xs text-slate-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <form onSubmit={(e) => handleConcederAcesso(e, d.id)} className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <ComboPessoa
                          candidatos={candidatosAcessoPorDemanda[d.id] ?? null}
                          onSelecionar={(cpf) => setNovoAcessoCpfPorDemanda((atual) => ({ ...atual, [d.id]: cpf }))}
                          valorSelecionado={novoAcessoCpfPorDemanda[d.id] ?? ""}
                        />
                      </div>
                      <Button type="submit" disabled={salvandoAcessoId === d.id}>
                        {salvandoAcessoId === d.id ? "Salvando..." : "Conceder acesso"}
                      </Button>
                    </form>
                    {erroAcessoPorDemanda[d.id] && (
                      <p className="mt-2 text-xs text-red-600">{erroAcessoPorDemanda[d.id]}</p>
                    )}
                  </div>
                )}

                {/* Pedido do Romulo: campo Sigilosa acima do link "Atribuir responsável". */}
                {podeVerEtapas && (
                  <div className="mt-2 flex items-center gap-2 text-xs font-normal text-slate-500">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={d.sigilosa}
                        onChange={() => handleAlternarSigilo(d.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      sigilosa
                    </label>
                    {d.sigilosa && d.podeGerenciarSigilo && (
                      <button
                        type="button"
                        onClick={() => alternarAcessoSigilo(d.id)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {acessoSigiloAberto === d.id ? "Ocultar acesso" : "Gerenciar acesso"}
                      </button>
                    )}
                  </div>
                )}
                {erroSigiloPorDemanda[d.id] && (
                  <p className="mt-1 text-xs text-red-600">{erroSigiloPorDemanda[d.id]}</p>
                )}

                {/* Linha única com "Atribuir responsável" + (se pendente) os três links de
                    decisão + "Adicionar etapa"/"Anexar imagem" (pedido do Romulo: juntar tudo
                    numa linha só - quebra naturalmente pra próxima linha se não couber, mas
                    fica lado a lado sempre que houver espaço). Mesmo padrão de texto fixo +
                    sublinhado dos demais. */}
                {(podeVerEtapas || imagensSoLink(d)) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                    {podeVerEtapas && (
                      <>
                        <button
                          type="button"
                          onClick={() => alternarResponsaveis(d.id)}
                          className={`inline-flex items-center gap-1 text-blue-600 hover:underline ${
                            responsavelAberto === d.id ? "underline" : ""
                          }`}
                        >
                          <IconeResponsavel className="h-3.5 w-3.5" />
                          Atribuir responsável
                        </button>
                        {(d.statusAprovacao === "pendente" || etapasSoLink(d) || imagensSoLink(d)) && (
                          <span className="text-slate-300">|</span>
                        )}
                      </>
                    )}
                    {podeVerEtapas && d.statusAprovacao === "pendente" && (
                      <>
                        <button
                          type="button"
                          onClick={() => abrirDecisao(d.id, "imediato")}
                          className={`inline-flex items-center gap-1 text-blue-600 hover:underline ${
                            decisaoAberta === d.id && decisaoModo === "imediato" ? "underline" : ""
                          }`}
                        >
                          <IconeRaio className="h-3.5 w-3.5" />
                          Aprovar de imediato
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => abrirDecisao(d.id, "kanban")}
                          className={`inline-flex items-center gap-1 text-blue-600 hover:underline ${
                            decisaoAberta === d.id && decisaoModo === "kanban" ? "underline" : ""
                          }`}
                        >
                          <IconeColunas className="h-3.5 w-3.5" />
                          Aprovar e enviar para Visão
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => abrirDecisao(d.id, "recusar")}
                          className={`inline-flex items-center gap-1 text-blue-600 hover:underline ${
                            decisaoAberta === d.id && decisaoModo === "recusar" ? "underline" : ""
                          }`}
                        >
                          <IconeRecusar className="h-3.5 w-3.5" />
                          Recusar
                        </button>
                        {(etapasSoLink(d) || imagensSoLink(d)) && <span className="text-slate-300">|</span>}
                      </>
                    )}
                    {etapasSoLink(d) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEtapasAbertoPorDemanda((atual) => ({ ...atual, [d.id]: true }))}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <IconeChecklist className="h-3.5 w-3.5" />
                          Adicionar etapa
                        </button>
                        {imagensSoLink(d) && <span className="text-slate-300">|</span>}
                      </>
                    )}
                    {imagensSoLink(d) && (
                      <button
                        type="button"
                        onClick={() => setImagensAbertoPorDemanda((atual) => ({ ...atual, [d.id]: true }))}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <IconeUpload className="h-3.5 w-3.5" />
                        Anexar imagem
                      </button>
                    )}
                  </div>
                )}

                {podeVerEtapas && responsavelAberto === d.id && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Funcionários responsáveis por essa demanda
                    </p>

                    {!responsaveisPorDemanda[d.id] && !erroResponsavelPorDemanda[d.id] && (
                      <p className="text-sm text-slate-500">Carregando...</p>
                    )}
                    {responsaveisPorDemanda[d.id]?.length === 0 && (
                      <p className="text-sm text-slate-500">Ninguém atribuído ainda.</p>
                    )}
                    {responsaveisPorDemanda[d.id] && responsaveisPorDemanda[d.id].length > 0 && (
                      <ul className="mb-3 space-y-1">
                        {responsaveisPorDemanda[d.id].map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                            <span>
                              {r.nome}{" "}
                              {(r.perfil || r.funcao) && (
                                <span className="text-xs text-slate-400">({r.perfil ? PERFIL_LABEL[r.perfil] : r.funcao})</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoverResponsavel(d.id, r.id)}
                              title="Remover"
                              className="text-xs text-slate-400 hover:text-red-600"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <form onSubmit={(e) => handleAtribuirResponsavel(e, d.id)} className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <ComboFuncionario
                          candidatos={candidatosResponsavelPorDemanda[d.id] ?? null}
                          onSelecionar={(cpf) => setNovoResponsavelCpfPorDemanda((atual) => ({ ...atual, [d.id]: cpf }))}
                          valorSelecionado={novoResponsavelCpfPorDemanda[d.id] ?? ""}
                        />
                      </div>
                      <Button type="submit" disabled={salvandoResponsavelId === d.id}>
                        {salvandoResponsavelId === d.id ? "Salvando..." : "Atribuir"}
                      </Button>
                    </form>
                    {erroResponsavelPorDemanda[d.id] && (
                      <p className="mt-2 text-xs text-red-600">{erroResponsavelPorDemanda[d.id]}</p>
                    )}
                  </div>
                )}

                {/* "Aprovar de imediato": sem Kanban - combo com as mensagens positivas
                    (pré-preenchida com a primeira cadastrada) + texto livre, que tem
                    prioridade sobre a combo quando preenchido. */}
                {podeVerEtapas && decisaoAberta === d.id && decisaoModo === "imediato" && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-600">Aprovar de imediato (sem Kanban)</p>
                    <select
                      value={comboAprovacaoId}
                      onChange={(e) => setComboAprovacaoId(e.target.value)}
                      className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {mensagensPositivas.length === 0 && (
                        <option value="">Nenhuma mensagem positiva cadastrada</option>
                      )}
                      {mensagensPositivas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.texto}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          placeholder="Ou digite um texto (tem prioridade sobre a mensagem)"
                          value={justificativaAprovacao}
                          onChange={(e) => setJustificativaAprovacao(e.target.value)}
                        />
                      </div>
                      <Button type="button" disabled={salvandoDecisao} onClick={() => handleAprovarImediato(d.id)}>
                        Aprovar
                      </Button>
                    </div>
                    {erroDecisao && <p className="text-sm text-red-600">{erroDecisao}</p>}
                  </div>
                )}

                {/* "Aprovar com Kanban": formulário de sempre, sem a parte de recusar ao lado. */}
                {podeVerEtapas && decisaoAberta === d.id && decisaoModo === "kanban" && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-600">Aprovar e enviar para Visão</p>
                    <div className="flex gap-2">
                      <select
                        value={colunaEscolhida}
                        onChange={(e) => setColunaEscolhida(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {(colunasKanban ?? []).length === 0 && <option value="">Nenhuma coluna cadastrada</option>}
                        {(colunasKanban ?? [])
                          .slice()
                          .sort((a, b) => a.ordem - b.ordem)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                      </select>
                      <Button
                        type="button"
                        disabled={salvandoDecisao || (colunasKanban ?? []).length === 0}
                        onClick={() => handleAprovarComKanban(d.id)}
                      >
                        Aprovar
                      </Button>
                    </div>
                    {erroDecisao && <p className="text-sm text-red-600">{erroDecisao}</p>}
                  </div>
                )}

                {/* "Recusar": mesmo esquema de combo + texto livre da "Aprovar de imediato",
                    só que com as mensagens negativas. */}
                {podeVerEtapas && decisaoAberta === d.id && decisaoModo === "recusar" && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-600">
                      Recusar (ex: já existe demanda igual aberta, resolvida na hora)
                    </p>
                    <select
                      value={comboRecusaId}
                      onChange={(e) => setComboRecusaId(e.target.value)}
                      className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {mensagensNegativas.length === 0 && (
                        <option value="">Nenhuma mensagem negativa cadastrada</option>
                      )}
                      {mensagensNegativas.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.texto}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          placeholder="Ou digite um texto (tem prioridade sobre a mensagem)"
                          value={motivoReprovacao}
                          onChange={(e) => setMotivoReprovacao(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={salvandoDecisao}
                        onClick={() => handleReprovar(d.id)}
                      >
                        Recusar
                      </Button>
                    </div>
                    {erroDecisao && <p className="text-sm text-red-600">{erroDecisao}</p>}
                  </div>
                )}

                {mostraSecaoEtapas(d) && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Etapas</p>
                    {/* Reprovada não tem mais o que ser feito - sem formulário de nova etapa,
                        mas etapa que já existisse de antes (ex: cadastrada enquanto ainda
                        pendente) continua visível abaixo, só não dá pra adicionar mais.
                        Morador nunca vê esse formulário (só visualização, pedido do Romulo). */}
                    {podeVerEtapas && d.statusAprovacao !== "reprovada" && (
                      <form
                        onSubmit={(e) => handleCriarEtapa(e, d.id)}
                        className="flex flex-wrap items-end gap-2 border-b border-slate-200 pb-3"
                      >
                        <div className="min-w-[10rem] flex-1">
                          <Input
                            required
                            placeholder="Nome da etapa"
                            value={formEtapa(d.id).nome}
                            onChange={(e) =>
                              setEtapaFormPorDemanda((atual) => ({
                                ...atual,
                                [d.id]: { ...formEtapa(d.id), nome: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <input
                          type="date"
                          value={formEtapa(d.id).prazo}
                          onChange={(e) =>
                            setEtapaFormPorDemanda((atual) => ({
                              ...atual,
                              [d.id]: { ...formEtapa(d.id), prazo: e.target.value },
                            }))
                          }
                          className="rounded-lg border-0 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <Button type="submit" disabled={salvandoEtapaId === d.id}>
                          {salvandoEtapaId === d.id ? "Salvando..." : "Adicionar etapa"}
                        </Button>
                      </form>
                    )}

                    {erroEtapasPorDemanda[d.id] && (
                      <p className="pt-2 text-sm text-red-600">{erroEtapasPorDemanda[d.id]}</p>
                    )}
                    {!etapasPorDemanda[d.id] && !erroEtapasPorDemanda[d.id] && (
                      <p className="pt-2 text-sm text-slate-500">Carregando etapas...</p>
                    )}
                    {etapasPorDemanda[d.id]?.length === 0 && (
                      <p className="pt-2 text-sm text-slate-500">Nenhuma etapa cadastrada ainda.</p>
                    )}

                    {etapasPorDemanda[d.id] && etapasPorDemanda[d.id].length > 0 && (
                      <ul className="divide-y divide-slate-200 pt-1">
                        {etapasPorDemanda[d.id].map((et) => (
                          <li key={et.id} className="flex items-start gap-2 py-2">
                            {podeVerEtapas && (
                              <input
                                type="checkbox"
                                checked={et.concluida}
                                onChange={() => handleAlternarConcluida(et.id, d.id)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                            <div className="flex-1">
                              <p
                                className={`text-sm ${et.concluida ? "text-slate-400 line-through" : "text-slate-800"}`}
                              >
                                {et.nome}
                              </p>
                              {(et.prazo || (et.concluida && et.concluidaEm)) && (
                                <p
                                  className={`text-xs ${
                                    etapaVencida(et)
                                      ? "font-medium text-red-600"
                                      : etapaVigente(et)
                                        ? "text-emerald-600"
                                        : "text-slate-400"
                                  }`}
                                >
                                  {et.prazo && (
                                    <>Prazo: {new Date(`${et.prazo}T00:00:00`).toLocaleDateString("pt-BR")}</>
                                  )}
                                  {et.prazo && et.concluida && et.concluidaEm && " · "}
                                  {et.concluida && et.concluidaEm && (
                                    <>concluída em {new Date(et.concluidaEm).toLocaleString("pt-BR")}</>
                                  )}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {!imagensSoLink(d) && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Imagens e vídeo</p>
                    {erroDocumentosPorDemanda[d.id] && <p className="mb-2 text-sm text-red-600">{erroDocumentosPorDemanda[d.id]}</p>}
                    <div className="flex flex-wrap gap-2">
                      {(documentosPorDemanda[d.id] ?? []).map((doc) => (
                        <div key={doc.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200">
                          <a href={urlImagem(doc.url, sessao.token)} target="_blank" rel="noreferrer">
                            {ehVideo(doc.tipoMime) ? (
                              <>
                                <video
                                  src={urlImagem(doc.url, sessao.token)}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="h-full w-full object-cover"
                                />
                                <IconePlay className="pointer-events-none absolute inset-0 m-auto h-6 w-6 text-white" />
                              </>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element -- servido pelo backend com token na query string, next/image não serve pra isso
                              <img src={urlImagem(doc.url, sessao.token)} alt={doc.nomeArquivo} className="h-full w-full object-cover" />
                            )}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoverDocumento(d.id, doc.id)}
                            title="Remover"
                            className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md bg-slate-900/70 text-xs text-white hover:bg-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <AdicionarAnexoBotao onEnviar={(arquivo) => handleAdicionarDocumento(d.id, arquivo)} />
                    </div>
                  </div>
                )}

                {/* Notas (pedido do Romulo): morador pergunta sobre o andamento, funcionário
                    responde se julgar necessário - visível pros dois papéis, mesma
                    visibilidade da demanda em si. Fica indisponível pra nota nova quando a
                    demanda está arquivada, mas o histórico continua visível. */}
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Notas</p>
                  {!d.arquivada ? (
                    <form onSubmit={(e) => handleCriarNota(e, d.id)} className="flex gap-2 border-b border-slate-200 pb-3">
                      <div className="min-w-0 flex-1">
                        <Input
                          required
                          maxLength={150}
                          placeholder="Perguntar sobre o andamento..."
                          value={formNota(d.id)}
                          onChange={(e) =>
                            setNovaNotaPorDemanda((atual) => ({ ...atual, [d.id]: e.target.value }))
                          }
                        />
                      </div>
                      <Button type="submit" disabled={salvandoNovaNotaId === d.id}>
                        {salvandoNovaNotaId === d.id ? "Enviando..." : "Enviar"}
                      </Button>
                    </form>
                  ) : (
                    <p className="border-b border-slate-200 pb-3 text-xs text-slate-400">
                      Demanda arquivada - não dá mais pra cadastrar nota nova.
                    </p>
                  )}
                  {erroNotasPorDemanda[d.id] && <p className="pt-2 text-sm text-red-600">{erroNotasPorDemanda[d.id]}</p>}
                  {!notasPorDemanda[d.id] && !erroNotasPorDemanda[d.id] && (
                    <p className="pt-2 text-sm text-slate-500">Carregando notas...</p>
                  )}
                  {notasPorDemanda[d.id]?.length === 0 && (
                    <p className="pt-2 text-sm text-slate-500">Nenhuma nota ainda.</p>
                  )}
                  {notasPorDemanda[d.id] &&
                    notasPorDemanda[d.id]
                      .filter((n) => n.notaPaiId === null)
                      .map((raiz) => renderNota(d, raiz, notasPorDemanda[d.id], 0))}
                </div>
                  </>
                )}
              </div>
              );
            })}
          </div>
        )}

        {demandas && demandas.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              {totalItensDemanda} {totalItensDemanda === 1 ? "demanda" : "demandas"} — página {paginaDemanda + 1} de{" "}
              {Math.max(totalPaginasDemanda, 1)}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPaginaDemanda((p) => Math.max(p - 1, 0))}
                disabled={paginaDemanda === 0}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPaginaDemanda((p) => Math.min(p + 1, totalPaginasDemanda - 1))}
                disabled={paginaDemanda + 1 >= totalPaginasDemanda}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function DemandasPage() {
  return (
    <Suspense fallback={null}>
      <DemandasPageInner />
    </Suspense>
  );
}
