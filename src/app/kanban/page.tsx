"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  acompanharDemanda,
  alternarConcluidaEtapa,
  alternarSigiloDemanda,
  arquivarDemanda,
  aprovarDemanda,
  atribuirResponsavel,
  buscarCondominio,
  buscarFuncionario,
  CandidatoAcessoResponse,
  CandidatoResponsavelResponse,
  concederAcessoSigiloso,
  CondominioResponse,
  criarDemanda,
  criarEtapa,
  criarEtiqueta,
  criarNotaDemanda,
  deixarDeAcompanharDemanda,
  DemandaAcessoSigilosoResponse,
  DemandaDocumentoResponse,
  DemandaEtapaResponse,
  DemandaNotaResponse,
  DemandaResponse,
  DemandaResponsavelResponse,
  DemandaStatusKanbanHistoricoResponse,
  desvincularEtiqueta,
  EtiquetaResponse,
  FuncionarioPerfil,
  FuncionarioResponse,
  listarAcessoSigiloso,
  listarCandidatosAcesso,
  listarCandidatosResponsavel,
  listarDemandas,
  listarDocumentosDemanda,
  listarEtapas,
  listarEtiquetas,
  listarHistoricoKanban,
  listarNotasDemanda,
  listarResponsaveis,
  listarStatusKanban,
  listarVinculosPorCondominio,
  listarVisualizacaoPorRegra,
  marcarNotaLida,
  moverDemandaKanban,
  PERFIL_LABEL,
  removerDocumentoDemanda,
  removerResponsavel,
  revogarAcessoSigiloso,
  StatusKanbanResponse,
  uploadDocumentoDemanda,
  urlImagem,
  vincularEtiqueta,
  VisualizadorPorRegraResponse,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { apenasDigitos, etapaVencida, etapaVigente, existeNotaPendente } from "@/lib/format";
import { ehVideo } from "@/lib/imagem-upload";
import { AppShell, EVENTO_ALERTAS_DEMANDAS } from "@/components/app-shell";
import { AdicionarAnexoBotao } from "@/components/adicionar-anexo-botao";
import { ComboFuncionario } from "@/components/combo-funcionario";
import { ComboPessoa } from "@/components/combo-pessoa";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { UploadImagens } from "@/components/upload-imagens";
import { Button, Input } from "@/components/ui";
import {
  IconeAjuda,
  IconeArquivadas,
  IconeChecklist,
  IconeFuncionarioOcioso,
  IconeNotaLida,
  IconeNotaPendente,
  IconePlay,
  IconeRelogio,
  IconeResponsavel,
  IconeUpload,
} from "@/components/icons";

const TITULO_MAX = 30;
const DESCRICAO_MAX = 70;
const COR_PADRAO = "#2F80ED";
const NOVA_DEMANDA_VAZIA = { titulo: "", descricao: "", sigilosa: false };

function truncarTitulo(titulo: string): string {
  return titulo.length > TITULO_MAX ? `${titulo.slice(0, TITULO_MAX)}…` : titulo;
}

/** Prévia plana da descrição no card - sem renderizar Markdown (não há espaço nem
 * necessidade numa linha só), só corta o texto cru. */
function truncarDescricao(descricao: string): string {
  return descricao.length > DESCRICAO_MAX ? `${descricao.slice(0, DESCRICAO_MAX)}…` : descricao;
}

/** Iniciais do primeiro e do último nome (pedido do Romulo) - placeholder do avatar de
 * responsável no card quando não tem foto cadastrada. "ROMULO ALMEIDA DE ANDRADE" -> "RA". */
function iniciaisResponsavel(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `FuncionarioResponse` (nome/foto/situação) não sabe o perfil - isso mora no vínculo com
 * o condomínio, não na pessoa. Combina os dois pra mostrar cargo/função ao lado do nome na
 * lista de ociosos (pedido do Romulo), mesmo fallback perfil→função das outras listas. */
type FuncionarioComPerfil = FuncionarioResponse & { perfil: FuncionarioPerfil | null; funcao: string | null };

/** Roster de funcionários ATIVOS do condomínio - mesmo padrão de `condominios/page.tsx`
 * (vínculos ativos + `buscarFuncionario` por id, em paralelo). Usado pro ícone/popup de
 * "sem demanda atribuída" (pedido do Romulo) - buscado assim que o quadro carrega, não só
 * quando o popup abre, porque o ícone precisa saber se fica vermelho antes do clique. */
async function buscarRosterFuncionarios(token: string, condominioId: number): Promise<FuncionarioComPerfil[]> {
  const vinculos = (await listarVinculosPorCondominio(token, condominioId)).filter((v) => v.situacao === "ativo");
  const funcionarios = await Promise.all(vinculos.map((v) => buscarFuncionario(token, v.funcionarioId)));
  return funcionarios
    .map((f, i) => ({ ...f, perfil: vinculos[i].perfil, funcao: vinculos[i].funcao }))
    .filter((f) => f.situacao === "ativo");
}

/** A última linha do histórico (mais recente) é a transição pra coluna atual - "há
 * quantos dias" é sempre em cima dela, nunca da criação da demanda (que pode ter sido
 * bem antes de entrar nessa coluna específica). */
function diasNaColunaAtual(historico: DemandaStatusKanbanHistoricoResponse[]): number {
  const ultima = historico[historico.length - 1];
  if (!ultima) return 0;
  const ms = Date.now() - new Date(ultima.createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatarDiasNaColuna(dias: number): string {
  if (dias === 0) return "Entrou nesta coluna hoje";
  return `Nesta coluna há ${dias} dia${dias === 1 ? "" : "s"}`;
}

/** Quadro Kanban do condomínio - uma coluna por `StatusKanban` já cadastrado (ver aba
 * Kanban do cadastro de condomínio), com as demandas já aprovadas (só elas têm coluna -
 * ver `DemandaService.aprovar`) como cards simples, só com o título (truncado em 30
 * caracteres - o resto fica no `title` do card, como tooltip nativo). Os cards são
 * arrastáveis entre colunas (drag-and-drop nativo do HTML, sem lib externa) - soltar
 * chama `moverDemandaKanban` (`DemandaService.moverKanban` no backend).
 *
 * Etiqueta (item 4.6): não tem mais ícone próprio no card (v75 - antes tinha, o Romulo
 * pediu pra tirar) - gerenciar (criar/anexar/remover) é uma seção dentro do modal de
 * detalhe, só visível pra funcionário (`podeGerenciar`) - morador nunca gerencia, só
 * enxerga (pedido do Romulo, v139: campo `visivelMorador` na etiqueta controla isso,
 * default true; `DemandaResponse.etiquetas` já vem filtrado pelo backend pra sessão de
 * morador). Etiquetas já anexadas aparecem em destaque (badge colorido, cor da própria
 * etiqueta) logo abaixo do título no card, mesmo sem o ícone - role-agnóstico, funciona
 * igual pros dois papéis desde sempre.
 *
 * Imagem/vídeo (item 4.9, vídeo desde o pedido do Romulo - até 15MB, no máximo 1 por
 * demanda, junto com no máximo 3 fotos - ver `DemandaDocumentoService`): ícone de upload -
 * abre um modal com os anexos já enviados (thumbnails, clicáveis pra abrir em aba nova) +
 * remover + um "+" pra anexar mais (`AdicionarAnexoBotao`), mesmo bloco "Imagens e vídeo"
 * que `/demandas` mostra inline em cada linha, só que aqui num modal (o card não tem
 * espaço pra isso). Miniatura de vídeo é o próprio `<video>` (primeiro frame) com um selo
 * de "play" por cima (`IconePlay`). O ícone vira **verde** quando `d.temAnexos` (calculado
 * no backend, `DemandaResponse.temAnexos`, e recalculado no cliente ao subir/remover pra
 * não esperar reload) e **cinza** quando não tem nenhum.
 *
 * Sigilo (item 4.8): não tem mais ícone de olho no card (v75 - o Romulo achou redundante
 * com o destaque já existente no título, vermelho e itálico quando `d.sigilosa`) - quem
 * pode gerenciar (`d.podeGerenciarSigilo`: síndico/sub-síndico do condomínio, ou o
 * funcionário que marcou como sigilosa) abre a mesma seção "Quem mais pode ver essa
 * demanda sigilosa" (lista + revogar + `ComboPessoa` pra conceder acesso) de dentro do
 * modal de detalhe, clicando no título/descrição do card como qualquer outra demanda.
 *
 * "+ Nova demanda": cadastra e já aprova pra coluna "Fila" num passo só (`criarDemanda` +
 * `aprovarDemanda` em sequência) - diferente do formulário em `/demandas`, que sempre
 * nasce pendente. Procura a coluna pelo nome "fila" (case-insensitive); se o condomínio
 * não tiver uma coluna com esse nome exato, cai pra primeira coluna por `ordem` - só
 * fica sem entrar em coluna nenhuma se o condomínio não tiver NENHUMA coluna cadastrada.
 * O modal também aceita anexar imagens (`UploadImagens`) - sobem depois que a demanda já
 * existe (precisa do id), então uma falha no upload não desfaz a demanda nem impede ela
 * de entrar na coluna. Fica no cabeçalho à ESQUERDA (v78, pedido do Romulo).
 *
 * Funcionários ociosos: ícone de busto+interrogações no cabeçalho à direita (v78, onde
 * antes ficava "+ Nova demanda") - abre um popup com quem está ativo no condomínio e não é
 * responsável por nenhuma demanda já aprovada no momento (busca o roster igual à aba
 * Funcionários de Condomínios: vínculos ativos + `buscarFuncionario` por id, em paralelo).
 * Cálculo 100% no cliente, sem endpoint novo - já tem tudo que precisa em `demandas`
 * (`DemandaResponse.responsaveis`, item 4.10) e no roster do condomínio.
 *
 * Funcionário e morador acessam a página (administrador não - não tem condomínio) mas só
 * funcionário GERENCIA (`podeGerenciar`): morador só acompanha, sem "+ Nova demanda", sem
 * arrastar card, sem ícone/modal de etiqueta - mesmos limites que a API já impõe
 * (`moverKanban`/`DemandaEtiqueta*` são funcionário-only; `listarEtiquetas` nem é chamada
 * pra morador, pra não estourar 403 e derrubar o `Promise.all` do carregamento inicial).
 *
 * `listarDemandas(token, true)` - quadro é visão geral do condomínio, não só "minhas
 * demandas" (diferente de `/demandas`): morador vê o board inteiro, igual funcionário,
 * com a única restrição sendo sigilo (demanda sigilosa continua só pra quem tem direito -
 * síndico/sub-síndico, o solicitante, quem marcou, ou quem foi indicado - ver
 * `DemandaService.listar`). Etiqueta marcada como `visivelMorador` aparece no card e no
 * detalhe pro morador também, desde a v139 (ver nota da seção "Etiqueta" acima). Pra quem
 * tem acesso, `#id` e título do card ficam em vermelho e itálico quando `d.sigilosa` - mesmo destaque
 * usado em `/demandas`.
 *
 * GIF do condomínio (v80, pedido do Romulo, opcional - ver Condomínios → aba Condomínio):
 * quando cadastrado, substitui o "Kanban — {nome}" pelo GIF em si. `sessao.condominioNome`
 * vem do token no login e não carrega o GIF junto, então busca o condomínio à parte
 * (`buscarCondominio`) - vale pros dois papéis, sem restrição.
 *
 * Coluna finalística (v82, `coluna.finalistico` - checkbox em Condomínios → aba Kanban):
 * card em coluna finalística ganha o botão "Arquivar" (só funcionário). Contorno da coluna
 * fica verde quando `finalistico` (v85, pedido do Romulo) - vale pros dois papéis,
 * diferente do contorno vermelho de coluna oculta (que só funcionário vê, já que é questão
 * de privacidade). **O título da coluna fica sem cor** (v87 - o Romulo voltou atrás na v85,
 * "quero que a cor do título fique sem verde, assim como as outras raias") - só o contorno
 * continua verde. Ícone no cabeçalho (v87/v89, ao lado do de ociosidade) abre a lista de
 * demandas arquivadas (`d.arquivada`) - número, título e descrição, sem busca própria (já
 * vem dentro de `demandas`) - vale pros DOIS papéis (v89, diferente do de ociosidade, que
 * é funcionário-only): morador também acompanha o que foi arquivado, respeitando sigilo de
 * graça (`demandas` já vem filtrada por quem pode ver cada uma antes de chegar aqui).
 * Demanda arquivada **some do quadro** (v88, pedido do Romulo - antes só ficava
 * acinzentada com um selo "Arquivada", continuava visível) - filtro em `cards` na hora de
 * montar cada coluna; continua acessível pelo ícone.
 *
 * Link no título da demanda na listagem de "Novidades" (alerta de login, ver
 * `AlertaMudancasStatus`) abre o mesmo card do Kanban, direto no detalhe - `?demanda=<id>`
 * na URL, lido aqui via `useSearchParams` e usado pra chamar `abrirModalDetalhe` assim que
 * as demandas carregarem. `useSearchParams` exige um Suspense boundary em build de
 * produção (a página é prerenderizada como estática) - daí o wrapper por fora, só isso,
 * todo o resto do componente continua igual. */
export default function KanbanPage() {
  return (
    <Suspense fallback={null}>
      <KanbanPageInner />
    </Suspense>
  );
}

function KanbanPageInner() {
  const sessao = useSessaoObrigatoria();
  const searchParams = useSearchParams();
  // Guarda o valor já tratado pra não reabrir o modal sozinho se o usuário fechar e
  // `demandas` mudar de novo por outro motivo (mover card, etc.) - só dispara uma vez
  // por valor de `?demanda=` na URL.
  const idAberturaAutomaticaTratado = useRef<string | null>(null);

  const [colunas, setColunas] = useState<StatusKanbanResponse[] | null>(null);
  const [demandas, setDemandas] = useState<DemandaResponse[] | null>(null);
  const [etiquetasDisponiveis, setEtiquetasDisponiveis] = useState<EtiquetaResponse[] | null>(null);
  const [condominioAtual, setCondominioAtual] = useState<CondominioResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Filtro de etiqueta no quadro (pedido do Romulo, pros dois papéis - morador só recebe
  // as `visivelMorador` em `etiquetasDisponiveis`, então nem precisa filtrar aqui de novo).
  // null = sem filtro, mostra tudo.
  const [filtroEtiquetaId, setFiltroEtiquetaId] = useState<number | null>(null);

  const [colunaSobreId, setColunaSobreId] = useState<number | null>(null);
  const [movendoId, setMovendoId] = useState<number | null>(null);
  const [erroMover, setErroMover] = useState<string | null>(null);

  // Arquivar demanda (pedido do Romulo) - botão no card, só quando a coluna é finalística.
  const [arquivandoId, setArquivandoId] = useState<number | null>(null);
  const [erroArquivar, setErroArquivar] = useState<string | null>(null);

  // Etiquetas agora vivem dentro do modal de detalhe (pedido do Romulo) - `etiquetasExpandido`
  // controla o "+" que revela adicionar existente/criar nova, ligado ao `modalDetalheId`.
  const [etiquetasExpandido, setEtiquetasExpandido] = useState(false);
  const [novaEtiquetaNome, setNovaEtiquetaNome] = useState("");
  const [novaEtiquetaCor, setNovaEtiquetaCor] = useState(COR_PADRAO);
  const [novaEtiquetaVisivelMorador, setNovaEtiquetaVisivelMorador] = useState(true);
  const [salvandoEtiqueta, setSalvandoEtiqueta] = useState(false);
  const [erroEtiqueta, setErroEtiqueta] = useState<string | null>(null);

  const [modalNovaDemandaAberto, setModalNovaDemandaAberto] = useState(false);
  const [novaDemandaCampos, setNovaDemandaCampos] = useState(NOVA_DEMANDA_VAZIA);
  const [novaDemandaImagens, setNovaDemandaImagens] = useState<File[]>([]);
  const [salvandoDemanda, setSalvandoDemanda] = useState(false);
  const [erroNovaDemanda, setErroNovaDemanda] = useState<string | null>(null);

  // Popup de funcionários sem demanda atribuída (pedido do Romulo, ícone no lugar do
  // "+ Nova demanda", que foi pro lado esquerdo) - `funcionariosCondominio` é cacheado na
  // primeira abertura (mesmo padrão dos outros modais menores).
  const [ociososAberto, setOciososAberto] = useState(false);
  const [funcionariosCondominio, setFuncionariosCondominio] = useState<FuncionarioComPerfil[] | null>(null);
  const [erroOciosos, setErroOciosos] = useState<string | null>(null);

  // Popup de demandas arquivadas (pedido do Romulo, ícone ao lado do de ociosidade) - sem
  // busca própria, `demandas` já vem com `arquivada` (v82).
  const [arquivadasAberto, setArquivadasAberto] = useState(false);

  // Legenda dos ícones/cores do quadro (pedido do Romulo) - sem busca própria, só texto
  // fixo explicando o que já existe na tela.
  const [legendaAberta, setLegendaAberta] = useState(false);

  // Modal de detalhe - aberto clicando na descrição/título do card. Reúne os mesmos
  // campos da listagem de `/demandas` (descrição, etapas, imagens, acesso sigiloso) num
  // só lugar, já que o card não tem espaço pra mostrar isso tudo direto.
  const [modalDetalheId, setModalDetalheId] = useState<number | null>(null);
  const [erroSigilo, setErroSigilo] = useState<string | null>(null);
  // Funcionalidade "Acompanhar" (pedido do Romulo): morador marca check numa demanda que
  // não é dele - ver `handleAlternarAcompanhar`.
  const [erroAcompanhar, setErroAcompanhar] = useState<string | null>(null);

  const [acessosPorDemanda, setAcessosPorDemanda] = useState<Record<number, DemandaAcessoSigilosoResponse[]>>({});
  const [candidatosAcessoPorDemanda, setCandidatosAcessoPorDemanda] = useState<
    Record<number, CandidatoAcessoResponse[]>
  >({});
  // Quem já vê a demanda sigilosa POR REGRA (síndico/sub-síndico do condomínio, pedido do
  // Romulo v151) - informativo, sem botão de revogar, diferente de `acessosPorDemanda`.
  const [visualizadoresPorRegraPorDemanda, setVisualizadoresPorRegraPorDemanda] = useState<
    Record<number, VisualizadorPorRegraResponse[]>
  >({});
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [novoAcessoCpf, setNovoAcessoCpf] = useState("");
  const [salvandoAcesso, setSalvandoAcesso] = useState(false);

  // Atribuir responsável (um ou mais funcionários) - mesmo padrão do acesso sigiloso
  // acima, levado do formulário de `/demandas` pro modal de detalhe do Kanban.
  const [responsaveisPorDemanda, setResponsaveisPorDemanda] = useState<Record<number, DemandaResponsavelResponse[]>>({});
  const [candidatosResponsavelPorDemanda, setCandidatosResponsavelPorDemanda] = useState<
    Record<number, CandidatoResponsavelResponse[]>
  >({});
  const [erroResponsavel, setErroResponsavel] = useState<string | null>(null);
  const [novoResponsavelCpf, setNovoResponsavelCpf] = useState("");
  const [salvandoResponsavel, setSalvandoResponsavel] = useState(false);

  const [documentosPorDemanda, setDocumentosPorDemanda] = useState<Record<number, DemandaDocumentoResponse[]>>({});
  const [erroImagens, setErroImagens] = useState<string | null>(null);

  const [etapasPorDemanda, setEtapasPorDemanda] = useState<Record<number, DemandaEtapaResponse[]>>({});
  const [erroEtapasPorDemanda, setErroEtapasPorDemanda] = useState<Record<number, string>>({});
  const [etapaFormPorDemanda, setEtapaFormPorDemanda] = useState<Record<number, { nome: string; prazo: string }>>({});
  const [salvandoEtapaId, setSalvandoEtapaId] = useState<number | null>(null);

  // Notas (pedido do Romulo): morador pergunta sobre o andamento, funcionário responde se
  // julgar necessário - mesmo padrão levado do formulário de `/demandas` pro modal de
  // detalhe do Kanban. Só uma nota-pai respondida por vez (mesmo espírito de
  // `novoResponsavelCpf`/`novoAcessoCpf` acima - só um modal de detalhe aberto por vez).
  const [notasPorDemanda, setNotasPorDemanda] = useState<Record<number, DemandaNotaResponse[]>>({});
  const [erroNotas, setErroNotas] = useState<string | null>(null);
  const [novaNotaTexto, setNovaNotaTexto] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [respostaAbertaNotaId, setRespostaAbertaNotaId] = useState<number | null>(null);
  const [textoResposta, setTextoResposta] = useState("");
  const [salvandoResposta, setSalvandoResposta] = useState(false);
  const [erroRespostaPorNota, setErroRespostaPorNota] = useState<Record<number, string>>({});
  const [marcandoLidaId, setMarcandoLidaId] = useState<number | null>(null);

  // Pedido do Romulo: no modal de detalhe, "Responsável"/"Etapas"/"Imagens"/"Notas" só
  // mostram o formulário quando já existe pelo menos um registro - senão vira um link
  // (mesmo padrão dos links da listagem de `/demandas`) que revela o formulário no clique.
  // Resetados a cada abertura do modal, ver `abrirModalDetalhe`.
  const [responsavelAberto, setResponsavelAberto] = useState(false);
  const [etapasAberto, setEtapasAberto] = useState(false);
  const [imagensAberto, setImagensAberto] = useState(false);
  const [notasAberto, setNotasAberto] = useState(false);

  // Ícone de relógio do card: tooltip no hover ("há quantos dias nesta coluna") + modal
  // com o histórico completo no clique. `historicoPorDemanda` é compartilhado pelos dois -
  // busca uma vez só, na primeira vez (hover ou clique, o que vier primeiro).
  const [historicoPorDemanda, setHistoricoPorDemanda] = useState<Record<number, DemandaStatusKanbanHistoricoResponse[]>>(
    {},
  );
  const [erroHistoricoPorDemanda, setErroHistoricoPorDemanda] = useState<Record<number, string>>({});
  const [hoverRelogioId, setHoverRelogioId] = useState<number | null>(null);
  const [modalHistoricoId, setModalHistoricoId] = useState<number | null>(null);

  useEffect(() => {
    if (!sessao || sessao.condominioId === null) return;
    if (sessao.tipoPapel !== "funcionario" && sessao.tipoPapel !== "morador") return;
    const ehFuncionario = sessao.tipoPapel === "funcionario";
    Promise.all([
      listarStatusKanban(sessao.token, sessao.condominioId),
      listarDemandas(sessao.token, true),
      // Etiqueta agora vale pros dois papéis (pedido do Romulo: filtro de etiqueta no
      // Kanban também pro morador) - o backend já devolve só as `visivelMorador` pra ele,
      // sem precisar filtrar aqui. Roster de funcionários (pro ícone de ociosos) continua
      // funcionário-only na API - nem chama pra morador, senão o 403 derrubaria o
      // Promise.all inteiro (colunas/demandas junto).
      listarEtiquetas(sessao.token, sessao.condominioId),
      ehFuncionario ? buscarRosterFuncionarios(sessao.token, sessao.condominioId) : Promise.resolve(null),
      // GIF do condomínio (pedido do Romulo) - `sessao.condominioNome` vem do token, não
      // tem o GIF junto, então busca o condomínio à parte. Vale pros dois papéis.
      buscarCondominio(sessao.token, sessao.condominioId),
    ])
      .then(([colunasCarregadas, demandasCarregadas, etiquetasCarregadas, rosterCarregado, condominioCarregado]) => {
        setColunas(colunasCarregadas);
        setDemandas(demandasCarregadas);
        setEtiquetasDisponiveis(etiquetasCarregadas);
        // Busca eager (não só quando o popup abre) porque o ícone precisa saber se fica
        // vermelho ANTES do funcionário clicar nele (pedido do Romulo).
        if (rosterCarregado) setFuncionariosCondominio(rosterCarregado);
        setCondominioAtual(condominioCarregado);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar o quadro."));
  }, [sessao]);

  // Pedido do Romulo: link no alerta de "Novidades" (`AlertaMudancasStatus`) manda pra cá
  // com `?demanda=<id>` na URL - assim que as demandas carregarem, abre o detalhe dessa
  // direto, sem precisar procurar o card manualmente.
  const idAberturaAutomatica = searchParams.get("demanda");
  useEffect(() => {
    if (!idAberturaAutomatica || !demandas) return;
    if (idAberturaAutomaticaTratado.current === idAberturaAutomatica) return;
    const id = Number(idAberturaAutomatica);
    if (!Number.isFinite(id) || !demandas.some((d) => d.id === id)) return;
    idAberturaAutomaticaTratado.current = idAberturaAutomatica;
    abrirModalDetalhe(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAberturaAutomatica, demandas]);

  if (!sessao) return null;

  if (sessao.tipoPapel !== "funcionario" && sessao.tipoPapel !== "morador") {
    return (
      <AppShell sessao={sessao}>
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Essa página é só para funcionário ou morador.
        </p>
      </AppShell>
    );
  }

  const podeGerenciar = sessao.tipoPapel === "funcionario";

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, demandaId: number) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(demandaId));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, colunaId: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setColunaSobreId(colunaId);
  }

  function handleDragLeave(colunaId: number) {
    setColunaSobreId((atual) => (atual === colunaId ? null : atual));
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>, colunaId: number) {
    e.preventDefault();
    setColunaSobreId(null);
    if (!sessao) return;

    const demandaId = Number(e.dataTransfer.getData("text/plain"));
    const demanda = (demandas ?? []).find((d) => d.id === demandaId);
    if (!demanda || demanda.statusKanbanId === colunaId) return;

    setErroMover(null);
    setMovendoId(demandaId);
    try {
      const atualizada = await moverDemandaKanban(sessao.token, demandaId, { statusKanbanId: colunaId });
      setDemandas((atual) => (atual ?? []).map((d) => (d.id === demandaId ? atualizada : d)));
    } catch (err) {
      setErroMover(err instanceof Error ? err.message : "Falha ao mover a demanda.");
    } finally {
      setMovendoId(null);
    }
  }

  /** Arquiva a demanda (pedido do Romulo) - só aparece pro funcionário e só em card de
   * coluna finalística. O backend confere de novo que a coluna é finalística. */
  async function handleArquivar(demandaId: number) {
    if (!sessao) return;
    setErroArquivar(null);
    setArquivandoId(demandaId);
    try {
      const atualizada = await arquivarDemanda(sessao.token, demandaId);
      setDemandas((atual) => (atual ?? []).map((d) => (d.id === demandaId ? atualizada : d)));
    } catch (err) {
      setErroArquivar(err instanceof Error ? err.message : "Falha ao arquivar a demanda.");
    } finally {
      setArquivandoId(null);
    }
  }

  function formEtapa(demandaId: number) {
    return etapaFormPorDemanda[demandaId] ?? { nome: "", prazo: "" };
  }

  /** Recalcula `temEtapaVencida`/`temEtapaVigente` de uma demanda direto no estado local
   * (`demandas`), a partir da lista de etapas já carregada - sem round-trip à API. Pedido
   * do Romulo: o contorno do card não atualizava sozinho depois de cadastrar/concluir uma
   * etapa, só recarregando a página inteira. Dispara `EVENTO_ALERTAS_DEMANDAS` também -
   * mesmo pedido, mas pro ícone do menu no topo (componente separado, sem esse aviso ele só
   * reconferiria no próximo minuto do intervalo, ver `AppShell`). */
  function atualizarFlagsEtapaNaDemanda(demandaId: number, etapas: DemandaEtapaResponse[]) {
    setDemandas((atual) =>
      (atual ?? []).map((d) =>
        d.id === demandaId
          ? { ...d, temEtapaVencida: etapas.some(etapaVencida), temEtapaVigente: etapas.some(etapaVigente) }
          : d,
      ),
    );
    window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
  }

  /** Mesma ideia de {@link atualizarFlagsEtapaNaDemanda}, pra `temNotaPendente` - ver
   * `existeNotaPendente` em `lib/format.ts` (mesmo critério do backend). */
  function atualizarFlagNotaNaDemanda(demandaId: number, notas: DemandaNotaResponse[]) {
    setDemandas((atual) =>
      (atual ?? []).map((d) => (d.id === demandaId ? { ...d, temNotaPendente: existeNotaPendente(notas) } : d)),
    );
    window.dispatchEvent(new Event(EVENTO_ALERTAS_DEMANDAS));
  }

  /** Clicar na descrição/título do card abre esse modal - reúne os mesmos campos da
   * listagem de `/demandas` (descrição, etapas, imagens, acesso sigiloso) num só lugar,
   * já que o card não tem espaço pra mostrar isso tudo direto. Cada bloco só busca seus
   * dados na primeira vez (mesmo padrão que os modais menores já tinham). */
  /** Carrega quem já tem acesso a uma demanda sigilosa (concessão explícita, candidatos
   * pra combo de busca, e quem já vê por regra/síndico) - separado de `abrirModalDetalhe`
   * pra também poder ser chamado quando uma demanda vira sigilosa NA HORA, com o modal já
   * aberto (ver `handleAlternarSigilo`) - sem isso, o painel passava a aparecer (já que a
   * condição `sigilosa && podeGerenciarSigilo` virou true) mas ficava em "Carregando..."
   * pra sempre, porque só `abrirModalDetalhe` disparava essas buscas, e ele já tinha
   * rodado (com a demanda ainda não-sigilosa) antes do card ser aberto - só fechar e
   * abrir o modal de novo corrigia (bug reportado pelo Romulo). */
  function carregarAcessoSigiloso(demandaId: number) {
    if (!sessao) return;
    if (!acessosPorDemanda[demandaId]) {
      listarAcessoSigiloso(sessao.token, demandaId)
        .then((lista) => setAcessosPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) => setErroAcesso(err instanceof Error ? err.message : "Falha ao carregar quem tem acesso."));
    }
    // Alimenta a combo de busca (ComboPessoa) - todo mundo ativo no condomínio.
    if (!candidatosAcessoPorDemanda[demandaId]) {
      listarCandidatosAcesso(sessao.token, demandaId)
        .then((lista) => setCandidatosAcessoPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) => setErroAcesso(err instanceof Error ? err.message : "Falha ao carregar as pessoas do condomínio."));
    }
    if (!visualizadoresPorRegraPorDemanda[demandaId]) {
      listarVisualizacaoPorRegra(sessao.token, demandaId)
        .then((lista) => setVisualizadoresPorRegraPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) => setErroAcesso(err instanceof Error ? err.message : "Falha ao carregar quem vê por padrão."));
    }
  }

  function abrirModalDetalhe(demandaId: number) {
    setModalDetalheId(demandaId);
    setErroSigilo(null);
    setErroImagens(null);
    setErroAcesso(null);
    setNovoAcessoCpf("");
    setErroResponsavel(null);
    setNovoResponsavelCpf("");
    setEtiquetasExpandido(false);
    setNovaEtiquetaNome("");
    setNovaEtiquetaCor(COR_PADRAO);
    setNovaEtiquetaVisivelMorador(true);
    setErroEtiqueta(null);
    setErroNotas(null);
    setNovaNotaTexto("");
    setRespostaAbertaNotaId(null);
    setTextoResposta("");
    setResponsavelAberto(false);
    setEtapasAberto(false);
    setImagensAberto(false);
    setNotasAberto(false);
    if (!sessao) return;

    if (!documentosPorDemanda[demandaId]) {
      listarDocumentosDemanda(sessao.token, demandaId)
        .then((lista) => setDocumentosPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) => setErroImagens(err instanceof Error ? err.message : "Falha ao carregar imagens."));
    }

    if (!notasPorDemanda[demandaId]) {
      listarNotasDemanda(sessao.token, demandaId)
        .then((lista) => setNotasPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) => setErroNotas(err instanceof Error ? err.message : "Falha ao carregar notas."));
    }

    if (!etapasPorDemanda[demandaId]) {
      listarEtapas(sessao.token, demandaId)
        .then((lista) => setEtapasPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
        .catch((err) =>
          setErroEtapasPorDemanda((atual) => ({
            ...atual,
            [demandaId]: err instanceof Error ? err.message : "Falha ao carregar etapas.",
          })),
        );
    }

    if (podeGerenciar) {
      if (!responsaveisPorDemanda[demandaId]) {
        listarResponsaveis(sessao.token, demandaId)
          .then((lista) => setResponsaveisPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
          .catch((err) => setErroResponsavel(err instanceof Error ? err.message : "Falha ao carregar responsáveis."));
      }
      // Alimenta a combo de busca (ComboFuncionario) - funcionários ativos do condomínio.
      if (!candidatosResponsavelPorDemanda[demandaId]) {
        listarCandidatosResponsavel(sessao.token, demandaId)
          .then((lista) => setCandidatosResponsavelPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
          .catch((err) =>
            setErroResponsavel(err instanceof Error ? err.message : "Falha ao carregar os funcionários do condomínio."),
          );
      }
    }

    const d = (demandas ?? []).find((x) => x.id === demandaId);
    if (d?.sigilosa && d.podeGerenciarSigilo) {
      carregarAcessoSigiloso(demandaId);
    }
  }

  function fecharModalDetalhe() {
    setModalDetalheId(null);
  }

  /** Busca uma vez só - hover no ícone de relógio e clique nele (abre o modal de
   * histórico) chamam a mesma função, então o segundo a acontecer já pega do cache. */
  function garantirHistorico(demandaId: number) {
    if (!sessao || historicoPorDemanda[demandaId] || erroHistoricoPorDemanda[demandaId]) return;
    listarHistoricoKanban(sessao.token, demandaId)
      .then((lista) => setHistoricoPorDemanda((atual) => ({ ...atual, [demandaId]: lista })))
      .catch((err) =>
        setErroHistoricoPorDemanda((atual) => ({
          ...atual,
          [demandaId]: err instanceof Error ? err.message : "Falha ao carregar histórico.",
        })),
      );
  }

  function handleHoverRelogio(demandaId: number) {
    setHoverRelogioId(demandaId);
    garantirHistorico(demandaId);
  }

  function abrirModalHistorico(demandaId: number) {
    setModalHistoricoId(demandaId);
    garantirHistorico(demandaId);
  }

  function fecharModalHistorico() {
    setModalHistoricoId(null);
  }

  /** Sobe na hora (mesma lógica de `AdicionarAnexoBotao`) e já marca `temAnexos` local
   * pra o ícone virar verde sem esperar recarregar o quadro inteiro. */
  async function handleUploadImagemModal(arquivo: File) {
    if (!sessao || modalDetalheId === null) return;
    const demandaId = modalDetalheId;
    const novo = await uploadDocumentoDemanda(sessao.token, demandaId, arquivo);
    setDocumentosPorDemanda((atual) => ({ ...atual, [demandaId]: [...(atual[demandaId] ?? []), novo] }));
    setDemandas((atual) => (atual ?? []).map((d) => (d.id === demandaId ? { ...d, temAnexos: true } : d)));
  }

  async function handleRemoverImagemModal(documentoId: number) {
    if (!sessao || modalDetalheId === null) return;
    const demandaId = modalDetalheId;
    setErroImagens(null);
    try {
      await removerDocumentoDemanda(sessao.token, documentoId);
      const restantes = (documentosPorDemanda[demandaId] ?? []).filter((doc) => doc.id !== documentoId);
      setDocumentosPorDemanda((atual) => ({ ...atual, [demandaId]: restantes }));
      // Se essa era a última imagem, o ícone do card volta pra cinza.
      setDemandas((atual) => (atual ?? []).map((d) => (d.id === demandaId ? { ...d, temAnexos: restantes.length > 0 } : d)));
    } catch (err) {
      setErroImagens(err instanceof Error ? err.message : "Falha ao remover imagem.");
    }
  }

  async function handleAlternarSigilo(demandaId: number) {
    if (!sessao) return;
    setErroSigilo(null);
    try {
      const atualizada = await alternarSigiloDemanda(sessao.token, demandaId);
      setDemandas((atual) => (atual ?? []).map((d) => (d.id === demandaId ? atualizada : d)));
      // Bug reportado pelo Romulo: marcar sigilosa com o modal já aberto fazia o painel
      // aparecer (a condição virou true) mas ficar em "Carregando..." pra sempre, porque
      // só `abrirModalDetalhe` disparava essas buscas - dispara aqui também, na hora.
      if (atualizada.sigilosa && atualizada.podeGerenciarSigilo) {
        carregarAcessoSigiloso(demandaId);
      }
    } catch (err) {
      setErroSigilo(err instanceof Error ? err.message : "Falha ao atualizar sigilo.");
    }
  }

  /** Funcionalidade "Acompanhar" (pedido do Romulo): morador marca/desmarca o check numa
   * demanda que ele não abriu - a partir daí, mudanças de status dela entram no alerta de
   * login junto das próprias (ver `AlertaMudancasStatus`). */
  async function handleAlternarAcompanhar(d: DemandaResponse) {
    if (!sessao) return;
    setErroAcompanhar(null);
    try {
      const atualizada = d.acompanhando
        ? await deixarDeAcompanharDemanda(sessao.token, d.id)
        : await acompanharDemanda(sessao.token, d.id);
      setDemandas((atual) => (atual ?? []).map((item) => (item.id === d.id ? atualizada : item)));
    } catch (err) {
      setErroAcompanhar(err instanceof Error ? err.message : "Falha ao atualizar o acompanhamento.");
    }
  }

  async function handleCriarEtapa(e: React.FormEvent, demandaId: number) {
    e.preventDefault();
    if (!sessao) return;
    const form = formEtapa(demandaId);
    setErroEtapasPorDemanda((atual) => ({ ...atual, [demandaId]: "" }));
    setSalvandoEtapaId(demandaId);
    try {
      const nova = await criarEtapa(sessao.token, { demandaId, nome: form.nome, prazo: form.prazo || null });
      const listaAtualizada = [...(etapasPorDemanda[demandaId] ?? []), nova];
      setEtapasPorDemanda((atual) => ({ ...atual, [demandaId]: listaAtualizada }));
      atualizarFlagsEtapaNaDemanda(demandaId, listaAtualizada);
      setEtapaFormPorDemanda((atual) => ({ ...atual, [demandaId]: { nome: "", prazo: "" } }));
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
      const listaAtualizada = (etapasPorDemanda[demandaId] ?? []).map((et) =>
        et.id === etapaId ? atualizada : et,
      );
      setEtapasPorDemanda((atual) => ({ ...atual, [demandaId]: listaAtualizada }));
      atualizarFlagsEtapaNaDemanda(demandaId, listaAtualizada);
    } catch (err) {
      setErroEtapasPorDemanda((atual) => ({
        ...atual,
        [demandaId]: err instanceof Error ? err.message : "Falha ao atualizar etapa.",
      }));
    }
  }

  async function handleConcederAcesso(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || modalDetalheId === null) return;
    if (!novoAcessoCpf) {
      setErroAcesso("Escolha alguém na busca antes de conceder.");
      return;
    }
    setErroAcesso(null);
    setSalvandoAcesso(true);
    try {
      const concedidos = await concederAcessoSigiloso(sessao.token, modalDetalheId, apenasDigitos(novoAcessoCpf));
      setAcessosPorDemanda((atual) => ({
        ...atual,
        [modalDetalheId]: [...(atual[modalDetalheId] ?? []), ...concedidos],
      }));
      setNovoAcessoCpf("");
    } catch (err) {
      setErroAcesso(err instanceof Error ? err.message : "Falha ao conceder acesso.");
    } finally {
      setSalvandoAcesso(false);
    }
  }

  async function handleRevogarAcesso(acessoId: number) {
    if (!sessao || modalDetalheId === null) return;
    setErroAcesso(null);
    try {
      await revogarAcessoSigiloso(sessao.token, modalDetalheId, acessoId);
      setAcessosPorDemanda((atual) => ({
        ...atual,
        [modalDetalheId]: (atual[modalDetalheId] ?? []).filter((a) => a.id !== acessoId),
      }));
    } catch (err) {
      setErroAcesso(err instanceof Error ? err.message : "Falha ao revogar acesso.");
    }
  }

  async function handleAtribuirResponsavel(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || modalDetalheId === null) return;
    if (!novoResponsavelCpf) {
      setErroResponsavel("Escolha alguém na busca antes de atribuir.");
      return;
    }
    setErroResponsavel(null);
    setSalvandoResponsavel(true);
    try {
      const atribuido = await atribuirResponsavel(sessao.token, modalDetalheId, apenasDigitos(novoResponsavelCpf));
      setResponsaveisPorDemanda((atual) => ({
        ...atual,
        [modalDetalheId]: [...(atual[modalDetalheId] ?? []), atribuido],
      }));
      // Reflete no avatar do card na hora - a foto fica ausente até recarregar (aba
      // fechar/reabrir), mesma aproximação já usada em `condominios/page.tsx`.
      setDemandas((atual) =>
        (atual ?? []).map((d) =>
          d.id === modalDetalheId
            ? {
                ...d,
                responsaveis: [
                  ...(d.responsaveis ?? []),
                  { funcionarioId: atribuido.funcionarioId, nome: atribuido.nome, fotoUrl: null },
                ],
              }
            : d,
        ),
      );
      setNovoResponsavelCpf("");
    } catch (err) {
      setErroResponsavel(err instanceof Error ? err.message : "Falha ao atribuir responsável.");
    } finally {
      setSalvandoResponsavel(false);
    }
  }

  async function handleRemoverResponsavel(atribuicaoId: number) {
    if (!sessao || modalDetalheId === null) return;
    setErroResponsavel(null);
    // Precisa do funcionarioId antes de remover da lista pra também tirar do avatar do
    // card - `atribuicaoId` é o id do vínculo, não da pessoa.
    const removido = (responsaveisPorDemanda[modalDetalheId] ?? []).find((r) => r.id === atribuicaoId);
    try {
      await removerResponsavel(sessao.token, modalDetalheId, atribuicaoId);
      setResponsaveisPorDemanda((atual) => ({
        ...atual,
        [modalDetalheId]: (atual[modalDetalheId] ?? []).filter((r) => r.id !== atribuicaoId),
      }));
      if (removido) {
        setDemandas((atual) =>
          (atual ?? []).map((d) =>
            d.id === modalDetalheId
              ? { ...d, responsaveis: (d.responsaveis ?? []).filter((r) => r.funcionarioId !== removido.funcionarioId) }
              : d,
          ),
        );
      }
    } catch (err) {
      setErroResponsavel(err instanceof Error ? err.message : "Falha ao remover responsável.");
    }
  }

  /** Cadastra uma pergunta nova (nota raiz, sem `notaPaiId`) - morador ou funcionário,
   * mesmo padrão de `/demandas`. */
  async function handleCriarNotaModal(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || modalDetalheId === null) return;
    const demandaId = modalDetalheId;
    setErroNotas(null);
    setSalvandoNota(true);
    try {
      const nova = await criarNotaDemanda(sessao.token, { demandaId, texto: novaNotaTexto });
      const listaAtualizada = [...(notasPorDemanda[demandaId] ?? []), nova];
      setNotasPorDemanda((atual) => ({ ...atual, [demandaId]: listaAtualizada }));
      atualizarFlagNotaNaDemanda(demandaId, listaAtualizada);
      setNovaNotaTexto("");
    } catch (err) {
      setErroNotas(err instanceof Error ? err.message : "Falha ao cadastrar nota.");
    } finally {
      setSalvandoNota(false);
    }
  }

  function abrirRespostaModal(notaId: number) {
    setRespostaAbertaNotaId((atual) => (atual === notaId ? null : notaId));
    setTextoResposta("");
  }

  /** Responde a uma nota - quando quem responde é funcionário, o backend já marca a
   * nota-pai como lida na mesma tacada, por isso o refetch da lista inteira (mesmo padrão
   * de `/demandas`). */
  async function handleResponderNotaModal(e: React.FormEvent, notaPaiId: number) {
    e.preventDefault();
    if (!sessao || modalDetalheId === null) return;
    const demandaId = modalDetalheId;
    setErroRespostaPorNota((atual) => ({ ...atual, [notaPaiId]: "" }));
    setSalvandoResposta(true);
    try {
      await criarNotaDemanda(sessao.token, { demandaId, notaPaiId, texto: textoResposta });
      const atualizadas = await listarNotasDemanda(sessao.token, demandaId);
      setNotasPorDemanda((atual) => ({ ...atual, [demandaId]: atualizadas }));
      atualizarFlagNotaNaDemanda(demandaId, atualizadas);
      setRespostaAbertaNotaId(null);
      setTextoResposta("");
    } catch (err) {
      setErroRespostaPorNota((atual) => ({
        ...atual,
        [notaPaiId]: err instanceof Error ? err.message : "Falha ao responder.",
      }));
    } finally {
      setSalvandoResposta(false);
    }
  }

  /** Só funcionário (pedido do Romulo) - responder a uma nota também marca ela como lida,
   * ver `handleResponderNotaModal`/backend. */
  async function handleMarcarNotaLidaModal(notaId: number) {
    if (!sessao || modalDetalheId === null) return;
    const demandaId = modalDetalheId;
    setMarcandoLidaId(notaId);
    try {
      const atualizada = await marcarNotaLida(sessao.token, notaId);
      const listaAtualizada = (notasPorDemanda[demandaId] ?? []).map((n) => (n.id === notaId ? atualizada : n));
      setNotasPorDemanda((atual) => ({ ...atual, [demandaId]: listaAtualizada }));
      atualizarFlagNotaNaDemanda(demandaId, listaAtualizada);
    } catch (err) {
      setErroNotas(err instanceof Error ? err.message : "Falha ao marcar como lida.");
    } finally {
      setMarcandoLidaId(null);
    }
  }

  /** Uma nota da árvore (raiz ou resposta) + suas respostas, recursivamente -
   * `profundidade` cresce a cada nível de resposta e vira a indentação (pedido do Romulo),
   * mesmo padrão de `/demandas`. */
  function renderNotaModal(nota: DemandaNotaResponse, todas: DemandaNotaResponse[], profundidade: number) {
    const filhas = todas.filter((n) => n.notaPaiId === nota.id);
    const podeMarcarLida = sessao?.tipoPapel === "funcionario";
    return (
      <div key={nota.id} style={{ marginLeft: profundidade * 20 }} className="mt-2">
        <div
          className={`rounded-lg border bg-white p-2.5 ${
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
                onClick={() => handleMarcarNotaLidaModal(nota.id)}
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
              onClick={() => abrirRespostaModal(nota.id)}
              className="mt-1 text-xs font-medium text-blue-600 hover:underline"
            >
              {respostaAbertaNotaId === nota.id ? "Cancelar" : "Responder"}
            </button>
          )}
          {respostaAbertaNotaId === nota.id && (
            <form onSubmit={(e) => handleResponderNotaModal(e, nota.id)} className="mt-2 flex gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  required
                  maxLength={150}
                  placeholder="Escreva uma resposta"
                  value={textoResposta}
                  onChange={(e) => setTextoResposta(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={salvandoResposta}>
                {salvandoResposta ? "Enviando..." : "Enviar"}
              </Button>
            </form>
          )}
          {erroRespostaPorNota[nota.id] && <p className="mt-1 text-xs text-red-600">{erroRespostaPorNota[nota.id]}</p>}
        </div>
        {filhas.map((filha) => renderNotaModal(filha, todas, profundidade + 1))}
      </div>
    );
  }

  function aplicarEtiquetaNaDemanda(demandaId: number, etiqueta: EtiquetaResponse) {
    setDemandas((atual) =>
      (atual ?? []).map((d) => (d.id === demandaId ? { ...d, etiquetas: [...d.etiquetas, etiqueta] } : d)),
    );
  }

  async function handleCriarEtiqueta(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || modalDetalheId === null || sessao.condominioId === null) return;
    setErroEtiqueta(null);
    setSalvandoEtiqueta(true);
    try {
      const nova = await criarEtiqueta(sessao.token, {
        condominioId: sessao.condominioId,
        descricao: novaEtiquetaNome,
        cor: novaEtiquetaCor,
        visivelMorador: novaEtiquetaVisivelMorador,
      });
      const vinculada = await vincularEtiqueta(sessao.token, { demandaId: modalDetalheId, etiquetaId: nova.id });
      setEtiquetasDisponiveis((atual) => [...(atual ?? []), nova]);
      aplicarEtiquetaNaDemanda(modalDetalheId, vinculada);
      setNovaEtiquetaNome("");
      setNovaEtiquetaVisivelMorador(true);
    } catch (err) {
      setErroEtiqueta(err instanceof Error ? err.message : "Falha ao criar etiqueta.");
    } finally {
      setSalvandoEtiqueta(false);
    }
  }

  async function handleVincular(etiquetaId: number) {
    if (!sessao || modalDetalheId === null) return;
    setErroEtiqueta(null);
    try {
      const vinculada = await vincularEtiqueta(sessao.token, { demandaId: modalDetalheId, etiquetaId });
      aplicarEtiquetaNaDemanda(modalDetalheId, vinculada);
    } catch (err) {
      setErroEtiqueta(err instanceof Error ? err.message : "Falha ao anexar etiqueta.");
    }
  }

  async function handleDesvincular(etiquetaId: number) {
    if (!sessao || modalDetalheId === null) return;
    setErroEtiqueta(null);
    try {
      await desvincularEtiqueta(sessao.token, modalDetalheId, etiquetaId);
      setDemandas((atual) =>
        (atual ?? []).map((d) =>
          d.id === modalDetalheId ? { ...d, etiquetas: d.etiquetas.filter((et) => et.id !== etiquetaId) } : d,
        ),
      );
    } catch (err) {
      setErroEtiqueta(err instanceof Error ? err.message : "Falha ao remover etiqueta.");
    }
  }

  function abrirModalNovaDemanda() {
    setNovaDemandaCampos(NOVA_DEMANDA_VAZIA);
    setNovaDemandaImagens([]);
    setErroNovaDemanda(null);
    setModalNovaDemandaAberto(true);
  }

  function fecharModalNovaDemanda() {
    setModalNovaDemandaAberto(false);
  }

  /** Normalmente o roster já veio pronto no carregamento do quadro (ver `useEffect` acima
   * - o ícone precisa saber se fica vermelho antes do clique); isso aqui só cobre o caso
   * de ter falhado silenciosamente ou ainda estar em voo quando o funcionário clica. */
  function abrirOciosos() {
    setOciososAberto(true);
    setErroOciosos(null);
    if (!sessao || sessao.condominioId === null || funcionariosCondominio) return;
    buscarRosterFuncionarios(sessao.token, sessao.condominioId)
      .then(setFuncionariosCondominio)
      .catch((err) => setErroOciosos(err instanceof Error ? err.message : "Falha ao carregar funcionários."));
  }

  function fecharOciosos() {
    setOciososAberto(false);
  }

  function abrirArquivadas() {
    setArquivadasAberto(true);
  }

  function fecharArquivadas() {
    setArquivadasAberto(false);
  }

  async function handleCriarDemanda(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setErroNovaDemanda(null);
    setSalvandoDemanda(true);

    let nova: DemandaResponse;
    try {
      // Sempre funcionário nesta tela (a página inteira é gated) - identificado por
      // padrão, igual ao padrão de funcionário no formulário de /demandas.
      nova = await criarDemanda(sessao.token, { ...novaDemandaCampos, identificarSolicitante: true });
    } catch (err) {
      setErroNovaDemanda(err instanceof Error ? err.message : "Falha ao cadastrar demanda.");
      setSalvandoDemanda(false);
      return;
    }

    // A demanda já nasceu - as imagens só têm onde subir depois disso (upload exige um
    // demandaId real). Uma falha aqui não desfaz a demanda nem trava o card (o Kanban não
    // mostra os anexos no card - só o título, ver comentário da página - mas eles ficam
    // salvos e visíveis em /demandas). Guardado à parte (não em erroNovaDemanda ainda)
    // pra não sumir se o passo de aprovar/mover pra "Fila" também tropeçar - os dois
    // avisos, se acontecerem, aparecem juntos no final.
    let avisoImagens = "";
    if (novaDemandaImagens.length > 0) {
      const falhas = (
        await Promise.allSettled(novaDemandaImagens.map((arquivo) => uploadDocumentoDemanda(sessao.token, nova.id, arquivo)))
      ).filter((r) => r.status === "rejected").length;
      setNovaDemandaImagens([]);
      if (falhas > 0) {
        avisoImagens = ` ${falhas} imagem(ns) não subiu(ram) - tente anexar de novo em Demandas.`;
      }
    }

    const filaColuna =
      (colunas ?? []).find((c) => c.nome.trim().toLowerCase() === "fila") ??
      (colunas ?? []).slice().sort((a, b) => a.ordem - b.ordem)[0] ??
      null;

    if (!filaColuna) {
      setDemandas((atual) => [...(atual ?? []), nova]);
      setErroNovaDemanda(
        `Demanda cadastrada, mas o condomínio não tem nenhuma coluna de Kanban - cadastre uma em Condomínios, na aba Kanban.${avisoImagens}`,
      );
      setSalvandoDemanda(false);
      return;
    }

    try {
      const aprovada = await aprovarDemanda(sessao.token, nova.id, { statusKanbanId: filaColuna.id });
      setDemandas((atual) => [...(atual ?? []), aprovada]);
      setModalNovaDemandaAberto(false);
      if (avisoImagens) setErroNovaDemanda(`Demanda cadastrada e aprovada.${avisoImagens}`);
    } catch (err) {
      setDemandas((atual) => [...(atual ?? []), nova]);
      setErroNovaDemanda(
        `Demanda cadastrada, mas não entrou na coluna "${filaColuna.nome}" automaticamente (${
          err instanceof Error ? err.message : "erro desconhecido"
        }) - aprove manualmente em Demandas.${avisoImagens}`,
      );
    } finally {
      setSalvandoDemanda(false);
    }
  }

  const demandaDetalhe = (demandas ?? []).find((d) => d.id === modalDetalheId) ?? null;
  const etiquetasParaAnexar = (etiquetasDisponiveis ?? []).filter(
    (et) => !(demandaDetalhe?.etiquetas ?? []).some((anexada) => anexada.id === et.id),
  );
  const acessosDoDetalhe = modalDetalheId !== null ? acessosPorDemanda[modalDetalheId] : undefined;
  const visualizadoresPorRegraDoDetalhe =
    modalDetalheId !== null ? visualizadoresPorRegraPorDemanda[modalDetalheId] : undefined;
  const documentosDoDetalhe = modalDetalheId !== null ? documentosPorDemanda[modalDetalheId] : undefined;
  const etapasDoDetalhe = modalDetalheId !== null ? etapasPorDemanda[modalDetalheId] : undefined;
  const responsaveisDoDetalhe = modalDetalheId !== null ? responsaveisPorDemanda[modalDetalheId] : undefined;
  const notasDoDetalhe = modalDetalheId !== null ? notasPorDemanda[modalDetalheId] : undefined;

  // Pedido do Romulo: "Responsável"/"Etapas"/"Imagens"/"Notas" só mostram o formulário
  // quando já existe pelo menos um registro (ou enquanto ainda carrega, pra não trocar de
  // link pra seção na cara do usuário) - senão vira um link (`xAberto` guarda o clique).
  const responsavelVazio = responsaveisDoDetalhe !== undefined && responsaveisDoDetalhe.length === 0;
  const etapasVazio = etapasDoDetalhe !== undefined && etapasDoDetalhe.length === 0;
  const imagensVazio = documentosDoDetalhe !== undefined && documentosDoDetalhe.length === 0;
  const notasVazio = notasDoDetalhe !== undefined && notasDoDetalhe.length === 0;

  // Pedido do Romulo: junta os links vazios ("Atribuir responsável"/"Adicionar etapa"/
  // "Anexar imagem"/"Perguntar sobre o andamento") numa linha só, separados por "|",
  // mesmo padrão da listagem de `/demandas`.
  const responsavelSoLink = podeGerenciar && responsavelVazio && !responsavelAberto;
  const etapasSoLink =
    podeGerenciar && etapasVazio && !etapasAberto && demandaDetalhe?.statusAprovacao !== "reprovada";
  const etapasEscondida = podeGerenciar && etapasVazio && demandaDetalhe?.statusAprovacao === "reprovada";
  // Pedido do Romulo: morador vê a seção de etapas em modo só-leitura (nome + prazo, sem
  // formulário de cadastro nem checkbox de concluir) - mas só quando já existe pelo menos
  // uma etapa (sem link "Adicionar etapa" pra ele, já que não pode criar nenhuma).
  const mostraSecaoEtapas = podeGerenciar
    ? !etapasSoLink && !etapasEscondida
    : (etapasDoDetalhe?.length ?? 0) > 0;
  // Imagens não é `podeGerenciar &&` como os outros três: pedido do Romulo pra morador
  // ter o mesmo tratamento de funcionário aqui (link quando vazio, cheio quando tem
  // registro) - já era assim em `/demandas` (o backend permite morador solicitante
  // anexar/remover, ver `DemandaDocumentoService.exigirPodeMexerAnexos`), só o modal do
  // Kanban ainda restringia visualmente por papel.
  const imagensSoLink = imagensVazio && !imagensAberto;
  const notasSoLink = notasVazio && !notasAberto;

  const demandaHistorico = (demandas ?? []).find((d) => d.id === modalHistoricoId) ?? null;
  const historicoDoModal = modalHistoricoId !== null ? historicoPorDemanda[modalHistoricoId] : undefined;

  // Ids de quem já é responsável por pelo menos uma demanda aprovada - o resto do roster
  // (ativos do condomínio) conta como "sem demanda atribuída" (ver `abrirOciosos`).
  const funcionariosOcupadosIds = new Set(
    (demandas ?? [])
      .filter((d) => d.statusAprovacao === "aprovada")
      .flatMap((d) => (d.responsaveis ?? []).map((r) => r.funcionarioId)),
  );
  const funcionariosOciosos = (funcionariosCondominio ?? []).filter((f) => !funcionariosOcupadosIds.has(f.id));

  const demandasArquivadas = (demandas ?? []).filter((d) => d.arquivada);

  return (
    <AppShell sessao={sessao} wide="full">
      <div className="flex items-center justify-between">
        <div className="flex flex-1">
          {podeGerenciar && (
            <Button type="button" onClick={abrirModalNovaDemanda}>
              + Nova demanda
            </Button>
          )}
        </div>
        {/* GIF do condomínio (pedido do Romulo) substitui o título quando cadastrado -
            ver Condomínios → aba Condomínio. */}
        {condominioAtual?.gifUrl ? (
          <div className="flex flex-1 justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- é GIF animado, next/image não anima; servido pelo backend com token na query string */}
            <img
              src={urlImagem(condominioAtual.gifUrl, sessao.token)}
              alt={sessao.condominioNome ?? "GIF do condomínio"}
              className="h-16 max-w-full object-contain"
            />
          </div>
        ) : (
          <h1 className="flex-1 text-center text-xl font-semibold text-slate-900">
            Kanban{sessao.condominioNome ? ` — ${sessao.condominioNome}` : ""}
          </h1>
        )}
        <div className="flex flex-1 items-center justify-end gap-3">
          {/* Pedido do Romulo: no lugar onde ficava "+ Nova demanda" antes de mover pro
              lado esquerdo - abre a lista de quem não tem nenhuma demanda atribuída. Fica
              vermelho quando existe pelo menos um ocioso (também pedido do Romulo) - só
              funcionário vê esse ícone, nunca morador (mesmo critério da v77). */}
          {podeGerenciar && (
            <button
              type="button"
              onClick={abrirOciosos}
              title={
                funcionariosOciosos.length > 0
                  ? `${funcionariosOciosos.length} funcionário(s) sem demanda atribuída`
                  : "Funcionários sem demanda atribuída"
              }
              className={
                funcionariosOciosos.length > 0 ? "text-red-500 hover:text-red-600" : "text-slate-400 hover:text-slate-600"
              }
            >
              <IconeFuncionarioOcioso className="h-6 w-6" />
            </button>
          )}
          {/* Pedido do Romulo, ao lado do ícone de ociosidade - lista as demandas com
              `arquivada = true` (v82). Diferente do ícone de ociosidade (funcionário-only,
              é informação interna de gestão), esse aqui vale pros DOIS papéis (v89, pedido
              do Romulo) - ver acompanhamento é coisa que morador também tem direito de
              fazer, só "arquivar" em si continua ação de funcionário. Sigilo já vem
              respeitado de graça: `demandasArquivadas` deriva de `demandas`, que o backend
              já filtra por quem pode ver cada demanda (sigilosa ou não) antes de mandar pro
              cliente - não existe caminho pra essa lista vazar uma demanda sigilosa que o
              morador não tem direito de ver. */}
          <button
            type="button"
            onClick={abrirArquivadas}
            title="Demandas arquivadas"
            className="text-slate-400 hover:text-slate-600"
          >
            <IconeArquivadas className="h-6 w-6" />
          </button>
          {/* Legenda dos ícones/cores do quadro (pedido do Romulo) - vale pros dois
              papéis, mesmo lugar dos outros ícones informativos do cabeçalho. */}
          <button
            type="button"
            onClick={() => setLegendaAberta(true)}
            title="Legenda dos ícones e cores"
            className="text-slate-400 hover:text-slate-600"
          >
            <IconeAjuda className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Filtro de etiqueta (pedido do Romulo, pros dois papéis - morador só vê as
          etiquetas marcadas visíveis pra ele, já filtrado pelo backend em
          `etiquetasDisponiveis`). Só aparece quando o condomínio já tem etiqueta
          cadastrada (ou, pro morador, pelo menos uma visível) - senão seria um filtro
          vazio à toa. */}
      {etiquetasDisponiveis && etiquetasDisponiveis.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="filtro-etiqueta" className="text-xs text-slate-500">
            Filtrar por etiqueta
          </label>
          <select
            id="filtro-etiqueta"
            value={filtroEtiquetaId ?? ""}
            onChange={(e) => setFiltroEtiquetaId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border-0 bg-slate-100 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas</option>
            {etiquetasDisponiveis.map((et) => (
              <option key={et.id} value={et.id}>
                {et.descricao}
              </option>
            ))}
          </select>
        </div>
      )}

      {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}
      {erroMover && <p className="mt-4 text-sm text-red-600">{erroMover}</p>}
      {erroArquivar && <p className="mt-4 text-sm text-red-600">{erroArquivar}</p>}
      {!erro && (colunas === null || demandas === null) && (
        <p className="mt-4 text-sm text-slate-500">Carregando...</p>
      )}
      {colunas?.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Nenhuma coluna de Kanban cadastrada ainda - cadastre em Condomínios, na aba Kanban.
        </p>
      )}

      {colunas && colunas.length > 0 && demandas && (
        <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
          {colunas
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((coluna) => {
              // Demanda arquivada some do quadro (pedido do Romulo) - continua acessível
              // pelo ícone de pasta no cabeçalho (`demandasArquivadas`, v87). Filtro de
              // etiqueta (pedido do Romulo) - `filtroEtiquetaId === null` = sem filtro.
              const cards = demandas.filter(
                (d) =>
                  d.statusKanbanId === coluna.id &&
                  !d.arquivada &&
                  (filtroEtiquetaId === null || d.etiquetas.some((et) => et.id === filtroEtiquetaId)),
              );
              return (
                <div
                  key={coluna.id}
                  onDragOver={(e) => handleDragOver(e, coluna.id)}
                  onDragLeave={() => handleDragLeave(coluna.id)}
                  onDrop={(e) => handleDrop(e, coluna.id)}
                  title={
                    !(coluna.visivelExternamente ?? true)
                      ? "Essa coluna não aparece pro morador - só funcionário/síndico vê"
                      : coluna.finalistico
                        ? "Situação finalística - representa o fim do fluxo dessa demanda"
                        : undefined
                  }
                  className={`min-w-[160px] flex-1 rounded-lg border bg-slate-100 transition-colors ${
                    colunaSobreId === coluna.id
                      ? "border-blue-400 ring-2 ring-blue-200"
                      : !(coluna.visivelExternamente ?? true)
                        ? "border-red-300"
                        : coluna.finalistico
                          ? "border-emerald-400"
                          : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    {/* Título fica sem cor, igual as outras raias (o Romulo voltou atrás
                        nisso - só o contorno da coluna continua verde quando finalística). */}
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{coluna.nome}</p>
                    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">
                      {cards.length}
                    </span>
                  </div>
                  <div className="min-h-[3rem] space-y-2 p-2">
                    {cards.length === 0 && <p className="px-1 py-2 text-xs text-slate-400">Nenhuma demanda</p>}
                    {cards.map((d) => {
                      // Destaque de etapa vencida/vigente (pedido do Romulo) não vale em
                      // coluna finalística - a demanda já chegou ao fim do fluxo, então o
                      // prazo de uma etapa deixou de ser urgente (mesmo espírito de
                      // "Arquivar" só valer ali). Vencida (vermelho) prevalece sobre
                      // vigente (verde) quando a demanda tem os dois ao mesmo tempo.
                      const destacarEtapaVencida = d.temEtapaVencida && !coluna.finalistico;
                      const destacarEtapaVigente = !destacarEtapaVencida && d.temEtapaVigente && !coluna.finalistico;
                      return (
                      <div
                        key={d.id}
                        draggable={podeGerenciar}
                        onDragStart={(e) => handleDragStart(e, d.id)}
                        title={
                          destacarEtapaVencida
                            ? "Tem etapa com prazo vencido"
                            : destacarEtapaVigente
                              ? "Tem etapa com prazo em aberto"
                              : undefined
                        }
                        className={`rounded-md border bg-white px-3 py-2 shadow-sm ${
                          destacarEtapaVencida
                            ? "border-red-400"
                            : destacarEtapaVigente
                              ? "border-emerald-400"
                              : "border-slate-200"
                        } ${movendoId === d.id || arquivandoId === d.id ? "opacity-50" : ""}`}
                      >
                        <div
                          className={`flex items-start justify-between gap-2 ${
                            podeGerenciar ? "cursor-grab active:cursor-grabbing" : ""
                          }`}
                        >
                          <button
                            type="button"
                            draggable={false}
                            onClick={() => abrirModalDetalhe(d.id)}
                            title={d.titulo}
                            className={`flex-1 text-left text-sm hover:underline ${
                              d.sigilosa ? "italic text-red-600" : "text-slate-800"
                            }`}
                          >
                            <span
                              className={`mr-1 font-mono text-xs ${
                                d.sigilosa ? "italic text-red-600" : "text-slate-400"
                              }`}
                            >
                              #{d.id}
                            </span>
                            {truncarTitulo(d.titulo)}
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            {/* Alerta de nota pendente (pedido do Romulo): só aparece quando
                                tem alguma nota ainda não lida ou sem resposta - calculado no
                                backend (`DemandaResponse.temNotaPendente`), pros dois papéis. */}
                            {d.temNotaPendente && (
                              <button
                                type="button"
                                draggable={false}
                                onClick={() => abrirModalDetalhe(d.id)}
                                title="Tem nota ainda não lida ou sem resposta"
                                className="text-amber-600 hover:text-amber-700"
                              >
                                <IconeNotaPendente className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {/* Funcionário sempre vê o ícone (anexar ou ver/anexar). Morador
                                só vê quando a demanda tem imagem - é um atalho de leitura pro
                                mesmo modal de detalhe (pedido do Romulo: todo morador pode
                                acompanhar as demandas e ver as imagens registradas). */}
                            {(podeGerenciar || d.temAnexos) && (
                              <button
                                type="button"
                                draggable={false}
                                onClick={() => abrirModalDetalhe(d.id)}
                                title={
                                  !podeGerenciar
                                    ? "Ver imagens"
                                    : d.temAnexos
                                      ? "Ver/anexar imagens"
                                      : "Anexar imagem"
                                }
                                className={
                                  d.temAnexos
                                    ? "text-emerald-600 hover:text-emerald-700"
                                    : "text-slate-400 hover:text-slate-600"
                                }
                              >
                                <IconeUpload className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {/* Relógio: hover mostra há quantos dias está nesta coluna, clique
                                abre o histórico completo de colunas (pedido do Romulo). Visível
                                pros dois papéis - só leitura, sem ação nenhuma. */}
                            <div className="relative">
                              <button
                                type="button"
                                draggable={false}
                                onMouseEnter={() => handleHoverRelogio(d.id)}
                                onMouseLeave={() => setHoverRelogioId(null)}
                                onClick={() => abrirModalHistorico(d.id)}
                                title="Histórico de colunas"
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <IconeRelogio className="h-3.5 w-3.5" />
                              </button>
                              {hoverRelogioId === d.id && (
                                <div className="absolute right-0 top-5 z-10 w-max max-w-[12rem] rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg">
                                  {erroHistoricoPorDemanda[d.id]
                                    ? "Falha ao carregar"
                                    : historicoPorDemanda[d.id]
                                      ? formatarDiasNaColuna(diasNaColunaAtual(historicoPorDemanda[d.id]))
                                      : "Carregando..."}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Descrição em prévia - clicar abre o mesmo modal de detalhe do
                            título/ícones (pedido do Romulo: clicar na descrição do card). */}
                        <button
                          type="button"
                          draggable={false}
                          onClick={() => abrirModalDetalhe(d.id)}
                          className="mt-1 block text-left text-xs text-slate-500 hover:underline"
                        >
                          {truncarDescricao(d.descricao)}
                        </button>
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
                        {/* Avatar (foto ou iniciais) de quem está atribuído - embaixo do
                            texto, separado por uma linha (pedido do Romulo, com imagem de
                            referência). Informação interna: `responsaveis` já vem vazio da
                            API pra sessão de morador (pedido do Romulo - "é só pra
                            funcionário"), então essa linha nunca aparece pra ele, mesmo
                            sem checar `podeGerenciar` aqui. `?? []` porque enquanto o
                            backend não reinicia com o campo novo, a API antiga não manda
                            `responsaveis` nenhum (undefined, não array vazio). */}
                        {(d.responsaveis ?? []).length > 0 && (
                          <div className="mt-1.5 flex items-center border-t border-slate-100 pt-1.5">
                            {(d.responsaveis ?? []).slice(0, 4).map((r, i) => (
                              <div
                                key={r.funcionarioId}
                                title={r.nome}
                                className={`flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-slate-200 text-[10px] font-bold text-slate-600 ${
                                  i > 0 ? "-ml-1.5" : ""
                                }`}
                              >
                                {r.fotoUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- servido pelo backend com token na query string, next/image não serve pra isso
                                  <img src={urlImagem(r.fotoUrl, sessao.token)} alt={r.nome} className="h-full w-full object-cover" />
                                ) : (
                                  iniciaisResponsavel(r.nome)
                                )}
                              </div>
                            ))}
                            {(d.responsaveis ?? []).length > 4 && (
                              <span className="-ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white bg-slate-300 text-[10px] font-bold text-slate-700">
                                +{(d.responsaveis ?? []).length - 4}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Arquivar (pedido do Romulo): só aparece quando a coluna é
                            finalística, e só pro funcionário (`podeGerenciar`), igual
                            arrastar o card. Uma vez arquivada, a demanda some do quadro na
                            hora (filtro em `cards` acima, v88) - não tem mais "selo" aqui
                            pra mostrar, ela simplesmente deixa de aparecer. */}
                        {podeGerenciar && coluna.finalistico && (
                          <div className="mt-1.5 border-t border-slate-100 pt-1.5">
                            <button
                              type="button"
                              draggable={false}
                              onClick={() => handleArquivar(d.id)}
                              disabled={arquivandoId === d.id}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {arquivandoId === d.id ? "Arquivando..." : "Arquivar"}
                            </button>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {ociososAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharOciosos}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Funcionários sem demanda atribuída</h2>
              <button type="button" onClick={fecharOciosos} className="shrink-0 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Ativos no condomínio, sem nenhuma demanda aprovada como responsável no momento.
            </p>

            <div className="mt-4">
              {erroOciosos && <p className="text-sm text-red-600">{erroOciosos}</p>}
              {!funcionariosCondominio && !erroOciosos && <p className="text-sm text-slate-500">Carregando...</p>}
              {funcionariosCondominio && funcionariosOciosos.length === 0 && (
                <p className="text-sm text-slate-500">Todo mundo já tem pelo menos uma demanda atribuída.</p>
              )}
              {funcionariosCondominio && funcionariosOciosos.length > 0 && (
                <ul className="space-y-2">
                  {funcionariosOciosos.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                        {f.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- servido pelo backend com token na query string, next/image não serve pra isso
                          <img src={urlImagem(f.fotoUrl, sessao.token)} alt={f.nome} className="h-full w-full object-cover" />
                        ) : (
                          iniciaisResponsavel(f.nome)
                        )}
                      </div>
                      {f.nome}
                      {(f.perfil || f.funcao) && (
                        <span className="text-xs text-slate-400">
                          ({f.perfil ? PERFIL_LABEL[f.perfil] : f.funcao})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {arquivadasAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharArquivadas}
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Demandas arquivadas</h2>
              <button
                type="button"
                onClick={fecharArquivadas}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              {demandasArquivadas.length === 0 && (
                <p className="text-sm text-slate-500">Nenhuma demanda arquivada ainda.</p>
              )}
              {demandasArquivadas.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {demandasArquivadas.map((d) => (
                    <li key={d.id} className="py-3">
                      <p className="text-sm font-medium text-slate-900">
                        <span className="mr-1 font-mono text-xs text-slate-400">#{d.id}</span>
                        {d.titulo}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{d.descricao}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legenda dos ícones/cores do quadro (pedido do Romulo) - cada linha mostra o
          elemento de verdade (mesma cor/ícone da tela), não só uma descrição em texto.
          Avatar de responsável e ícone de ociosidade só aparecem pra funcionário (mesmo
          critério de `podeGerenciar` que já esconde eles do morador na tela de verdade -
          não faz sentido explicar pro morador algo que ele nunca vai ver). */}
      {legendaAberta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setLegendaAberta(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Legenda do Kanban</h2>
              <button
                type="button"
                onClick={() => setLegendaAberta(false)}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-5 text-sm">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">No card</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-center font-mono text-xs italic text-red-600">#0</span>
                    <span className="text-slate-600">Número/título em vermelho itálico - demanda sigilosa.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <IconeNotaPendente className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="text-slate-600">
                      Tem nota (pergunta ou resposta) ainda não lida ou sem resposta.
                    </span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <IconeUpload className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-slate-600">Sem imagem anexada ainda.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <IconeUpload className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-slate-600">Já tem imagem anexada.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <IconeRelogio className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="text-slate-600">
                      Tempo na coluna atual - passe o mouse pra ver quantos dias, clique pra ver o histórico completo.
                    </span>
                  </li>
                  {podeGerenciar && (
                    <li className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white bg-slate-300 text-[9px] font-bold text-slate-600">
                        RS
                      </span>
                      <span className="text-slate-600">
                        Foto ou iniciais - funcionário(s) responsável(is) pela demanda (só funcionário vê).
                      </span>
                    </li>
                  )}
                  <li className="flex items-center gap-2.5">
                    <span className="shrink-0 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-medium text-white">
                      Etiqueta
                    </span>
                    <span className="text-slate-600">Classificação livre - cor escolhida por quem cadastra.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="h-4 w-4 shrink-0 rounded border-2 border-red-400 bg-white" />
                    <span className="text-slate-600">Contorno vermelho - tem etapa com prazo já vencido.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="h-4 w-4 shrink-0 rounded border-2 border-emerald-400 bg-white" />
                    <span className="text-slate-600">
                      Contorno verde - tem etapa com prazo em aberto (ainda não vencida).
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Na coluna</p>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2.5">
                    <span className="h-4 w-4 shrink-0 rounded border-2 border-red-300 bg-slate-100" />
                    <span className="text-slate-600">Contorno vermelho - coluna oculta pro morador.</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="h-4 w-4 shrink-0 rounded border-2 border-emerald-400 bg-slate-100" />
                    <span className="text-slate-600">
                      Contorno verde - coluna finalística (fim do fluxo, permite arquivar a demanda).
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">No topo</p>
                <ul className="space-y-2.5">
                  {podeGerenciar && (
                    <li className="flex items-center gap-2.5">
                      <IconeFuncionarioOcioso className="h-5 w-5 shrink-0 text-red-500" />
                      <span className="text-slate-600">
                        Existe funcionário sem nenhuma demanda atribuída (fica cinza quando não tem nenhum).
                      </span>
                    </li>
                  )}
                  <li className="flex items-center gap-2.5">
                    <IconeArquivadas className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="text-slate-600">Abre a lista de demandas arquivadas.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalNovaDemandaAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharModalNovaDemanda}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Nova demanda</h2>
              <button
                type="button"
                onClick={fecharModalNovaDemanda}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Vai direto pra coluna &quot;Fila&quot; do Kanban.</p>

            <form onSubmit={handleCriarDemanda} className="mt-4 space-y-3">
              <Input
                required
                placeholder="Título"
                value={novaDemandaCampos.titulo}
                onChange={(e) => setNovaDemandaCampos((c) => ({ ...c, titulo: e.target.value }))}
              />
              <MarkdownEditor
                required
                placeholder="Descrição"
                value={novaDemandaCampos.descricao}
                onChange={(descricao) => setNovaDemandaCampos((c) => ({ ...c, descricao }))}
                rows={6}
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={novaDemandaCampos.sigilosa}
                  onChange={(e) => setNovaDemandaCampos((c) => ({ ...c, sigilosa: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Demanda sigilosa
              </label>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Imagens e vídeo (opcional)
                </p>
                <UploadImagens arquivos={novaDemandaImagens} onChange={setNovaDemandaImagens} />
              </div>

              {erroNovaDemanda && <p className="text-sm text-red-600">{erroNovaDemanda}</p>}

              <div className="flex justify-end pt-1">
                <Button type="submit" disabled={salvandoDemanda}>
                  {salvandoDemanda ? "Salvando..." : "Cadastrar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de detalhe - aberto clicando na descrição/título do card. Mesmos campos da
          listagem de `/demandas` (descrição, metadata, etapas, imagens, acesso
          sigiloso), só que num modal em vez de inline numa linha (o card não tem espaço
          pra isso). Substitui os antigos modais separados de "Imagens" e "Quem mais pode
          ver" - agora tudo abre junto. */}
      {demandaDetalhe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharModalDetalhe}
        >
          <div
            // Pedido do Romulo: modal estreito (max-w-lg = 32rem) deixava os formulários
            // apertados, com botão quebrando linha e ficando desalinhado - alargado pra
            // bater com a largura da listagem de `/demandas` (`max-w-4xl` do AppShell).
            className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                className={`flex items-center text-sm font-medium ${
                  demandaDetalhe.sigilosa ? "italic text-red-600" : "text-slate-900"
                }`}
              >
                <span
                  className={`mr-1.5 font-mono text-xs font-normal ${
                    demandaDetalhe.sigilosa ? "italic text-red-600" : "text-slate-400"
                  }`}
                >
                  #{demandaDetalhe.id}
                </span>
                {demandaDetalhe.titulo}
                {/* Pedido do Romulo: campo "sigilosa" saiu de aqui do título e foi pro
                    bloco logo acima de "Atribuir responsável" (mesmo lugar de /demandas) -
                    aqui só sobra o selo de leitura, igual pra todo mundo. */}
                {demandaDetalhe.sigilosa && <span className="ml-1.5 text-xs text-slate-400">(sigilosa)</span>}
                {/* Funcionalidade "Acompanhar" (pedido do Romulo): morador marca check numa
                    demanda que ele não abriu, pra entrar no alerta de mudança de status
                    dela junto das próprias - `podeAcompanhar` já vem calculado do backend
                    (morador e não é quem abriu essa demanda). */}
                {demandaDetalhe.podeAcompanhar && (
                  <label className="ml-2 flex items-center gap-1 text-xs font-normal text-slate-400">
                    <input
                      type="checkbox"
                      checked={demandaDetalhe.acompanhando}
                      onChange={() => handleAlternarAcompanhar(demandaDetalhe)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Acompanhar
                  </label>
                )}
              </p>
              <button
                type="button"
                onClick={fecharModalDetalhe}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            {erroAcompanhar && <p className="mt-1 text-xs text-red-600">{erroAcompanhar}</p>}

            <Markdown texto={demandaDetalhe.descricao} className="mt-2 text-sm text-slate-600" />

            <p className="mt-3 text-xs italic text-slate-400">
              Aberta por {demandaDetalhe.identificarSolicitante ? demandaDetalhe.solicitanteNome : "Anônimo"} (
              {demandaDetalhe.solicitanteTipo === "morador" ? "morador" : "funcionário"}) em{" "}
              {formatarData(demandaDetalhe.createdAt)}
              {demandaDetalhe.statusKanbanNome && (
                <>
                  {" "}
                  · <strong className="font-semibold not-italic text-slate-600">{demandaDetalhe.statusKanbanNome}</strong>
                </>
              )}
              {demandaDetalhe.funcionarioResponsavelNome && <> · responsável: {demandaDetalhe.funcionarioResponsavelNome}</>}
            </p>
            {demandaDetalhe.statusAprovacao !== "pendente" && demandaDetalhe.funcionarioAprovadorNome && (
              <p className="mt-1 text-xs italic text-slate-400">
                {demandaDetalhe.statusAprovacao === "aprovada" ? "Aprovada" : "Recusada"} por{" "}
                {demandaDetalhe.funcionarioAprovadorNome}
                {demandaDetalhe.dataAprovacao && <> em {formatarData(demandaDetalhe.dataAprovacao)}</>}
                {demandaDetalhe.statusAprovacao === "reprovada" && demandaDetalhe.justificativaReprovacao && (
                  <>
                    : <strong className="font-semibold not-italic text-slate-600">{demandaDetalhe.justificativaReprovacao}</strong>
                  </>
                )}
                {demandaDetalhe.statusAprovacao === "aprovada" && demandaDetalhe.justificativaAprovacao && (
                  <>
                    : <strong className="font-semibold not-italic text-slate-600">{demandaDetalhe.justificativaAprovacao}</strong>
                  </>
                )}
              </p>
            )}

            {/* Etiquetas - antes vivia num modal à parte, aberto pelo ícone no card;
                agora fica direto aqui dentro (pedido do Romulo, com imagem de referência).
                "+" revela adicionar existente/criar nova, pra não poluir a tela por padrão.
                Morador (sem `podeGerenciar`) vê a mesma listagem, só sem remover/adicionar
                (mesmo padrão da seção de etapas, v134) - e só quando tem alguma etiqueta
                `visivelMorador`, pra não mostrar um título "Etiquetas" vazio à toa. */}
            {(podeGerenciar || demandaDetalhe.etiquetas.length > 0) && (
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-900">Etiquetas</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {demandaDetalhe.etiquetas.map((et) => (
                    <span
                      key={et.id}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-white"
                      style={{ backgroundColor: et.cor }}
                    >
                      {et.descricao}
                      {podeGerenciar && (
                        <button
                          type="button"
                          onClick={() => handleDesvincular(et.id)}
                          title="Remover"
                          className="text-white/80 hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                  {podeGerenciar && (
                    <button
                      type="button"
                      onClick={() => setEtiquetasExpandido((v) => !v)}
                      title="Adicionar etiqueta"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600"
                    >
                      +
                    </button>
                  )}
                </div>

                {podeGerenciar && etiquetasExpandido && (
                  <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Adicionar existente</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {etiquetasParaAnexar.length === 0 && (
                          <p className="text-xs text-slate-400">Nenhuma etiqueta disponível.</p>
                        )}
                        {etiquetasParaAnexar.map((et) => (
                          <button
                            key={et.id}
                            type="button"
                            onClick={() => handleVincular(et.id)}
                            className="rounded-full px-2.5 py-1 text-xs text-white hover:opacity-80"
                            style={{ backgroundColor: et.cor }}
                          >
                            + {et.descricao}
                          </button>
                        ))}
                      </div>
                    </div>

                    <form onSubmit={handleCriarEtiqueta} className="border-t border-slate-200 pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Nova etiqueta</p>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="color"
                          value={novaEtiquetaCor}
                          onChange={(e) => setNovaEtiquetaCor(e.target.value)}
                          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-slate-200"
                        />
                        <div className="min-w-0 flex-1">
                          <Input
                            required
                            maxLength={50}
                            placeholder="Nome da etiqueta"
                            value={novaEtiquetaNome}
                            onChange={(e) => setNovaEtiquetaNome(e.target.value)}
                          />
                        </div>
                        <Button type="submit" disabled={salvandoEtiqueta}>
                          {salvandoEtiqueta ? "Salvando..." : "Criar"}
                        </Button>
                      </div>
                      <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={novaEtiquetaVisivelMorador}
                          onChange={(e) => setNovaEtiquetaVisivelMorador(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Visível para morador?
                      </label>
                    </form>
                  </div>
                )}
                {erroEtiqueta && <p className="mt-2 text-xs text-red-600">{erroEtiqueta}</p>}
              </div>
            )}

            {demandaDetalhe.sigilosa && demandaDetalhe.podeGerenciarSigilo && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {/* Quem já vê por REGRA (síndico/sub-síndico) - informativo, sem "✕" de
                    remover (diferente da lista de concessão explícita abaixo). Pedido do
                    Romulo: "quem tem acesso ao card já sabe quem também está vendo". */}
                {visualizadoresPorRegraDoDetalhe && visualizadoresPorRegraDoDetalhe.length > 0 && (
                  <div className="mb-3 border-b border-slate-200 pb-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Já veem por padrão
                    </p>
                    <ul className="space-y-1">
                      {visualizadoresPorRegraDoDetalhe.map((v, i) => (
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
                {!acessosDoDetalhe && !erroAcesso && <p className="text-sm text-slate-500">Carregando...</p>}
                {acessosDoDetalhe?.length === 0 && <p className="text-sm text-slate-500">Ninguém foi indicado ainda.</p>}
                {acessosDoDetalhe && acessosDoDetalhe.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {acessosDoDetalhe.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span>
                          {a.nome}{" "}
                          <span className="text-xs text-slate-400">
                            ({a.tipoPessoa === "morador" ? "morador" : "funcionário"})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRevogarAcesso(a.id)}
                          title="Remover"
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={handleConcederAcesso} className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <ComboPessoa
                      candidatos={candidatosAcessoPorDemanda[demandaDetalhe.id] ?? null}
                      onSelecionar={setNovoAcessoCpf}
                      valorSelecionado={novoAcessoCpf}
                    />
                  </div>
                  <Button type="submit" disabled={salvandoAcesso}>
                    {salvandoAcesso ? "Salvando..." : "Conceder"}
                  </Button>
                </form>
                {erroAcesso && <p className="mt-2 text-xs text-red-600">{erroAcesso}</p>}
              </div>
            )}

            {/* Pedido do Romulo: campo Sigilosa acima do link "Atribuir responsável"
                (mesmo lugar de /demandas) - saiu do título pra ficar aqui. */}
            {podeGerenciar && (
              <div className="mt-3 flex items-center gap-2 text-xs font-normal text-slate-500">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={demandaDetalhe.sigilosa}
                    onChange={() => handleAlternarSigilo(demandaDetalhe.id)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  sigilosa
                </label>
              </div>
            )}
            {erroSigilo && <p className="mt-1 text-xs text-red-600">{erroSigilo}</p>}

            {/* Pedido do Romulo: só mostra o formulário quando já existe registro (ou
                enquanto ainda carrega) - senão vira um link; os links vazios ficam juntos
                numa linha só, separados por "|", mesmo padrão da listagem de `/demandas`. */}
            {(responsavelSoLink || etapasSoLink || imagensSoLink || notasSoLink) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium">
                {responsavelSoLink && (
                  <button
                    type="button"
                    onClick={() => setResponsavelAberto(true)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <IconeResponsavel className="h-3.5 w-3.5" />
                    Atribuir responsável
                  </button>
                )}
                {responsavelSoLink && (etapasSoLink || imagensSoLink || notasSoLink) && (
                  <span className="text-slate-300">|</span>
                )}
                {etapasSoLink && (
                  <button
                    type="button"
                    onClick={() => setEtapasAberto(true)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <IconeChecklist className="h-3.5 w-3.5" />
                    Adicionar etapa
                  </button>
                )}
                {etapasSoLink && (imagensSoLink || notasSoLink) && <span className="text-slate-300">|</span>}
                {imagensSoLink && (
                  <button
                    type="button"
                    onClick={() => setImagensAberto(true)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <IconeUpload className="h-3.5 w-3.5" />
                    Anexar imagem
                  </button>
                )}
                {imagensSoLink && notasSoLink && <span className="text-slate-300">|</span>}
                {notasSoLink && (
                  <button
                    type="button"
                    onClick={() => setNotasAberto(true)}
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <IconeNotaPendente className="h-3.5 w-3.5" />
                    Incluir nota
                  </button>
                )}
              </div>
            )}

            {!responsavelSoLink && (
              podeGerenciar && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Funcionários responsáveis por essa demanda
                  </p>
                  {!responsaveisDoDetalhe && !erroResponsavel && <p className="text-sm text-slate-500">Carregando...</p>}
                  {responsaveisDoDetalhe?.length === 0 && (
                    <p className="text-sm text-slate-500">Ninguém atribuído ainda.</p>
                  )}
                  {responsaveisDoDetalhe && responsaveisDoDetalhe.length > 0 && (
                    <ul className="mb-3 space-y-1">
                      {responsaveisDoDetalhe.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                          <span>
                            {r.nome}{" "}
                            {(r.perfil || r.funcao) && (
                              <span className="text-xs text-slate-400">({r.perfil ? PERFIL_LABEL[r.perfil] : r.funcao})</span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoverResponsavel(r.id)}
                            title="Remover"
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={handleAtribuirResponsavel} className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <ComboFuncionario
                        candidatos={candidatosResponsavelPorDemanda[demandaDetalhe.id] ?? null}
                        onSelecionar={setNovoResponsavelCpf}
                        valorSelecionado={novoResponsavelCpf}
                      />
                    </div>
                    <Button type="submit" disabled={salvandoResponsavel}>
                      {salvandoResponsavel ? "Salvando..." : "Atribuir"}
                    </Button>
                  </form>
                  {erroResponsavel && <p className="mt-2 text-xs text-red-600">{erroResponsavel}</p>}
                </div>
              )
            )}

            {mostraSecaoEtapas && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Etapas</p>
                {podeGerenciar && demandaDetalhe.statusAprovacao !== "reprovada" && (
                  <form
                    onSubmit={(e) => handleCriarEtapa(e, demandaDetalhe.id)}
                    className="flex flex-wrap items-end gap-2 border-b border-slate-200 pb-3"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <Input
                        required
                        placeholder="Nome da etapa"
                        value={formEtapa(demandaDetalhe.id).nome}
                        onChange={(e) =>
                          setEtapaFormPorDemanda((atual) => ({
                            ...atual,
                            [demandaDetalhe.id]: { ...formEtapa(demandaDetalhe.id), nome: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <input
                      type="date"
                      value={formEtapa(demandaDetalhe.id).prazo}
                      onChange={(e) =>
                        setEtapaFormPorDemanda((atual) => ({
                          ...atual,
                          [demandaDetalhe.id]: { ...formEtapa(demandaDetalhe.id), prazo: e.target.value },
                        }))
                      }
                      className="rounded-lg border-0 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button type="submit" disabled={salvandoEtapaId === demandaDetalhe.id}>
                      {salvandoEtapaId === demandaDetalhe.id ? "Salvando..." : "Adicionar etapa"}
                    </Button>
                  </form>
                )}

                {erroEtapasPorDemanda[demandaDetalhe.id] && (
                  <p className="pt-2 text-sm text-red-600">{erroEtapasPorDemanda[demandaDetalhe.id]}</p>
                )}
                {!etapasDoDetalhe && !erroEtapasPorDemanda[demandaDetalhe.id] && (
                  <p className="pt-2 text-sm text-slate-500">Carregando etapas...</p>
                )}
                {etapasDoDetalhe?.length === 0 && (
                  <p className="pt-2 text-sm text-slate-500">Nenhuma etapa cadastrada ainda.</p>
                )}

                {etapasDoDetalhe && etapasDoDetalhe.length > 0 && (
                  <ul className="divide-y divide-slate-200 pt-1">
                    {etapasDoDetalhe.map((et) => (
                      <li key={et.id} className="flex items-start gap-2 py-2">
                        {podeGerenciar && (
                          <input
                            type="checkbox"
                            checked={et.concluida}
                            onChange={() => handleAlternarConcluida(et.id, demandaDetalhe.id)}
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

            {!imagensSoLink && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Imagens e vídeo</p>
                {erroImagens && <p className="mb-2 text-sm text-red-600">{erroImagens}</p>}
                <div className="flex flex-wrap gap-2">
                  {!documentosDoDetalhe && !erroImagens && <p className="text-sm text-slate-500">Carregando...</p>}
                  {/* Morador tem o mesmo tratamento de funcionário aqui (anexa/remove
                      direto) - o backend confere se é solicitante ou funcionário do
                      condomínio na hora (ver DemandaDocumentoService), então tentar sem
                      direito só dá um erro inline, sem vazar nada. Mesmo padrão de
                      `/demandas`, que já era assim. */}
                  {documentosDoDetalhe?.map((doc) => (
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
                        onClick={() => handleRemoverImagemModal(doc.id)}
                        title="Remover"
                        className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md bg-slate-900/70 text-xs text-white hover:bg-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {documentosDoDetalhe && <AdicionarAnexoBotao onEnviar={handleUploadImagemModal} />}
                </div>
              </div>
            )}

            {/* Notas (pedido do Romulo): morador pergunta sobre o andamento, funcionário
                responde se julgar necessário - visível pros dois papéis, mesmo padrão
                levado de `/demandas`. */}
            {!notasSoLink && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Notas</p>
                {!demandaDetalhe.arquivada ? (
                  <form onSubmit={handleCriarNotaModal} className="flex gap-2 border-b border-slate-200 pb-3">
                    <div className="min-w-0 flex-1">
                      <Input
                        required
                        maxLength={150}
                        placeholder="Perguntar sobre o andamento..."
                        value={novaNotaTexto}
                        onChange={(e) => setNovaNotaTexto(e.target.value)}
                      />
                    </div>
                    <Button type="submit" disabled={salvandoNota}>
                      {salvandoNota ? "Enviando..." : "Enviar"}
                    </Button>
                  </form>
                ) : (
                  <p className="border-b border-slate-200 pb-3 text-xs text-slate-400">
                    Demanda arquivada - não dá mais pra cadastrar nota nova.
                  </p>
                )}
                {erroNotas && <p className="pt-2 text-sm text-red-600">{erroNotas}</p>}
                {!notasDoDetalhe && !erroNotas && <p className="pt-2 text-sm text-slate-500">Carregando notas...</p>}
                {notasDoDetalhe?.length === 0 && <p className="pt-2 text-sm text-slate-500">Nenhuma nota ainda.</p>}
                {notasDoDetalhe &&
                  notasDoDetalhe
                    .filter((n) => n.notaPaiId === null)
                    .map((raiz) => renderNotaModal(raiz, notasDoDetalhe, 0))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico de colunas - aberto pelo clique no ícone de relógio do card. */}
      {demandaHistorico && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharModalHistorico}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Histórico — {truncarTitulo(demandaHistorico.titulo)}
              </h2>
              <button
                type="button"
                onClick={fecharModalHistorico}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              {modalHistoricoId !== null && erroHistoricoPorDemanda[modalHistoricoId] && (
                <p className="text-sm text-red-600">{erroHistoricoPorDemanda[modalHistoricoId]}</p>
              )}
              {!historicoDoModal && !(modalHistoricoId !== null && erroHistoricoPorDemanda[modalHistoricoId]) && (
                <p className="text-sm text-slate-500">Carregando...</p>
              )}
              {historicoDoModal && historicoDoModal.length > 0 && (
                <ul className="space-y-3">
                  {historicoDoModal
                    .slice()
                    .reverse()
                    .map((h) => (
                      <li key={h.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <p className="text-sm text-slate-800">
                          {h.statusAnteriorNome ? (
                            <>
                              {h.statusAnteriorNome} → <strong className="font-semibold">{h.statusNovoNome}</strong>
                            </>
                          ) : (
                            <>
                              Entrou em <strong className="font-semibold">{h.statusNovoNome}</strong>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          por {h.funcionarioNome} em {formatarDataHora(h.createdAt)}
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
