"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ativarVinculoFuncionario,
  ativarVinculoMorador,
  atualizarAviso,
  atualizarBloco,
  atualizarCondominio,
  atualizarEtiqueta,
  atualizarMensagemRapida,
  atualizarStatusKanban,
  atualizarVinculoFuncionario,
  atualizarVinculoMorador,
  AvisoResponse,
  BlocoResponse,
  buscarFuncionarioPorEmail,
  buscarMoradorPorEmail,
  buscarPessoaPorEmail,
  CondominioResponse,
  CondominioTipo,
  criarAviso,
  criarBloco,
  criarCondominio,
  criarEtiqueta,
  criarFuncionario,
  criarMensagemRapida,
  criarMorador,
  criarStatusKanban,
  criarVinculoFuncionario,
  criarVinculoMorador,
  desativarAviso,
  desativarCondominio,
  desativarVinculoFuncionario,
  desativarVinculoMorador,
  desfixarAvisoNoTopo,
  EtiquetaResponse,
  excluirMensagemRapida,
  excluirStatusKanban,
  fixarAvisoNoTopo,
  FuncionarioCondominioResumoResponse,
  FuncionarioPerfil,
  gerarLinkPublicoKanban,
  listarAvisosDoCondominio,
  listarBlocos,
  listarCondominios,
  listarEtiquetas,
  listarMensagensRapidas,
  listarPaginaFuncionarios,
  listarPaginaMoradores,
  listarStatusKanban,
  MensagemRapidaCarater,
  MensagemRapidaResponse,
  MoradorCondominioResumoResponse,
  PERFIL_LABEL,
  removerFotoFuncionario,
  removerGifCondominio,
  revogarLinkPublicoKanban,
  StatusKanbanResponse,
  uploadFotoFuncionario,
  uploadGifCondominio,
  urlKanbanPublico,
  zerarSenhaVinculoFuncionario,
  zerarSenhaVinculoMorador,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { apenasDigitos, formatarCnpj, formatarTelefone } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { UploadGifCondominio } from "@/components/upload-gif-condominio";
import { Button, Input } from "@/components/ui";
import { UploadFotoPerfil } from "@/components/upload-foto-perfil";
import { IconeArrastar, IconeChave, IconeFixado, IconeLapis, IconeLink, IconeLixeira } from "@/components/icons";

const TIPO_LABEL: Record<CondominioTipo, string> = {
  apartamento: "Apartamento",
  casas: "Casas",
};

/** "Apartamento (3)" ou "Casas (540)" - a quantidade entre parênteses é de blocos ou de
 * casas, dependendo do tipo. */
function labelTipo(c: CondominioResponse): string {
  const qtd = c.tipo === "apartamento" ? c.quantidadeBlocos : c.quantidadeCasas;
  return qtd !== null && qtd !== undefined ? `${TIPO_LABEL[c.tipo]} (${qtd})` : TIPO_LABEL[c.tipo];
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const FORM_VAZIO = { nome: "", cnpj: "", tipo: "apartamento" as CondominioTipo, quantidadeCasas: "" };
const FUNCIONARIO_VAZIO = { email: "", nome: "", telefone: "", perfil: "" as FuncionarioPerfil | "", funcao: "" };
const MORADOR_VAZIO = { email: "", nome: "", telefone: "", blocoId: "", numeroUnidade: "" };

// E-mail é o novo identificador de pessoa (LGPD, v177) - regex simples só pra decidir
// quando vale a pena disparar a busca debounced, a validação de verdade é do backend.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tipos das linhas das tabelas Funcionário/Morador - já vêm com nome/e-mail/telefone/foto
// embutidos direto da página paginada (ver `listarPaginaFuncionarios`/`listarPaginaMoradores`),
// sem precisar de um `buscarFuncionario`/`buscarMorador` por linha.
type FuncionarioDoCondominio = FuncionarioCondominioResumoResponse;
type MoradorDoCondominio = MoradorCondominioResumoResponse;

export default function CondominiosPage() {
  const sessao = useSessaoObrigatoria();

  const [condominios, setCondominios] = useState<CondominioResponse[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);

  // Filtros da grid de condomínios - client-side, sobre a lista já carregada.
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<CondominioTipo | "">("");

  // null = form fechado; "novo" = cadastrando (ainda sem id); number = editando esse
  // condomínio (inclui o caso "acabou de ser criado", pra liberar as outras abas sem
  // precisar fechar e reabrir o formulário).
  const [form, setForm] = useState<"novo" | number | null>(null);
  const [aba, setAba] = useState<
    | "condominio"
    | "blocos"
    | "funcionarios"
    | "moradores"
    | "avisos"
    | "kanban"
    | "etiquetas"
    | "mensagens-rapidas"
  >("condominio");
  const [campos, setCampos] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [erroLinha, setErroLinha] = useState<{ id: number; mensagem: string } | null>(null);

  // Modal do link público do Kanban (pedido do Romulo: "deixar o kanban disponível em
  // um link externo, independente do usuário estar logado") - `linkPublicoAberto` guarda
  // o condomínio cujo modal está aberto no momento (null = fechado).
  const [linkPublicoAberto, setLinkPublicoAberto] = useState<CondominioResponse | null>(null);
  const [gerandoLinkPublico, setGerandoLinkPublico] = useState(false);
  const [revogandoLinkPublico, setRevogandoLinkPublico] = useState(false);
  const [erroLinkPublico, setErroLinkPublico] = useState<string | null>(null);
  const [linkPublicoCopiado, setLinkPublicoCopiado] = useState(false);

  const [funcionarios, setFuncionarios] = useState<FuncionarioDoCondominio[] | null>(null);
  const [erroFuncionarios, setErroFuncionarios] = useState<string | null>(null);
  const [buscaFuncionario, setBuscaFuncionario] = useState("");
  // Texto de busca "debounced" - só isso (não `buscaFuncionario` puro) entra na
  // dependência do fetch, pra não bater uma request por tecla digitada. Pedido do
  // Romulo: paginação de 15 registros por página, "a ideia é performance para não
  // listar todos de vez" - a busca virou server-side pra combinar com a paginação (client-side
  // só filtraria dentro da página já carregada).
  const [buscaEfetivaFuncionario, setBuscaEfetivaFuncionario] = useState("");
  const [paginaFuncionario, setPaginaFuncionario] = useState(0);
  const [totalPaginasFuncionario, setTotalPaginasFuncionario] = useState(0);
  const [totalItensFuncionario, setTotalItensFuncionario] = useState(0);

  const [novoFuncionario, setNovoFuncionario] = useState(FUNCIONARIO_VAZIO);
  // Pedido do Romulo (LGPD, v177): funcionário pode não ter e-mail - marcando isso, pula a
  // busca e revela nome/telefone direto, sem exigir e-mail.
  const [funcionarioSemEmail, setFuncionarioSemEmail] = useState(false);
  const [buscandoEmail, setBuscandoEmail] = useState(false);
  // Preenchido quando o e-mail já existe como pessoa - evita pedir nome de novo.
  const [pessoaEncontrada, setPessoaEncontrada] = useState<{ id: number; nome: string; email: string | null } | null>(
    null,
  );
  // Preenchido quando o e-mail já é funcionário (nesse ou em outro condomínio) - nesse caso
  // não recria o papel de funcionário, só vincula a este condomínio.
  const [funcionarioEncontrado, setFuncionarioEncontrado] = useState<{ id: number } | null>(null);
  const [erroBuscaEmail, setErroBuscaEmail] = useState<string | null>(null);
  const [salvandoFuncionario, setSalvandoFuncionario] = useState(false);

  // Mesmo padrão da edição de morador: reaproveita o formulário "Adicionar funcionário"
  // em vez de um formulário separado - `null` = modo cadastro (padrão).
  const [funcionarioEditandoId, setFuncionarioEditandoId] = useState<number | null>(null);
  // Pedido do Romulo: uma vez que a pessoa já tem e-mail cadastrado, só administrador pode
  // trocar (síndico/sub-síndico não - evita que troque o e-mail de outra pessoa pra tomar
  // a conta dela depois). Calculado ao abrir a edição (não a cada tecla) - reflete o e-mail
  // ORIGINAL do vínculo, não o que está sendo digitado agora.
  const [emailBloqueadoFuncionario, setEmailBloqueadoFuncionario] = useState(false);
  const [erroLinhaFuncionario, setErroLinhaFuncionario] = useState<{ id: number; mensagem: string } | null>(null);
  const [ativandoFuncionario, setAtivandoFuncionario] = useState(false);
  const [zerandoSenhaFuncionarioId, setZerandoSenhaFuncionarioId] = useState<number | null>(null);

  const [moradores, setMoradores] = useState<MoradorDoCondominio[] | null>(null);
  const [erroMoradores, setErroMoradores] = useState<string | null>(null);
  const [buscaMorador, setBuscaMorador] = useState("");
  // Mesmo espírito de `buscaEfetivaFuncionario` acima.
  const [buscaEfetivaMorador, setBuscaEfetivaMorador] = useState("");
  const [paginaMorador, setPaginaMorador] = useState(0);
  const [totalPaginasMorador, setTotalPaginasMorador] = useState(0);
  const [totalItensMorador, setTotalItensMorador] = useState(0);

  // Editar reaproveita o próprio formulário "Adicionar morador" (em vez de um formulário
  // separado ou edição inline na linha) - preenche os campos com o registro escolhido e
  // troca "Adicionar" por "Salvar". `null` = formulário em modo cadastro (padrão).
  const [moradorEditandoId, setMoradorEditandoId] = useState<number | null>(null);
  // Mesma trava de e-mail já cadastrado da edição de funcionário (ver
  // `emailBloqueadoFuncionario`) - só administrador pode trocar.
  const [emailBloqueadoMorador, setEmailBloqueadoMorador] = useState(false);
  const [erroLinhaMorador, setErroLinhaMorador] = useState<{ id: number; mensagem: string } | null>(null);
  const [ativandoMorador, setAtivandoMorador] = useState(false);
  // vinculoId sendo zerado no momento (spinner/disable só naquela linha) - null quando nenhum.
  const [zerandoSenhaId, setZerandoSenhaId] = useState<number | null>(null);

  const [novoMorador, setNovoMorador] = useState(MORADOR_VAZIO);
  const [buscandoEmailMorador, setBuscandoEmailMorador] = useState(false);
  // Preenchido quando o e-mail já existe como pessoa - evita pedir nome de novo (morador
  // sempre exige e-mail, diferente de funcionário).
  const [pessoaEncontradaMorador, setPessoaEncontradaMorador] = useState<{
    id: number;
    nome: string;
    email: string | null;
  } | null>(null);
  // Preenchido quando o e-mail já é morador (nesse ou em outro condomínio) - nesse caso não
  // recria o papel de morador, só vincula a este condomínio.
  const [moradorEncontrado, setMoradorEncontrado] = useState<{ id: number } | null>(null);
  const [erroBuscaEmailMorador, setErroBuscaEmailMorador] = useState<string | null>(null);
  const [salvandoMorador, setSalvandoMorador] = useState(false);
  const [blocosCondominio, setBlocosCondominio] = useState<BlocoResponse[] | null>(null);
  const [erroBlocos, setErroBlocos] = useState<string | null>(null);
  const [novoBlocoNome, setNovoBlocoNome] = useState("");
  const [salvandoBloco, setSalvandoBloco] = useState(false);
  const [blocoEditando, setBlocoEditando] = useState<number | null>(null);
  const [edicaoBlocoNome, setEdicaoBlocoNome] = useState("");
  const [salvandoEdicaoBloco, setSalvandoEdicaoBloco] = useState(false);

  const [avisos, setAvisos] = useState<AvisoResponse[] | null>(null);
  const [erroAvisos, setErroAvisos] = useState<string | null>(null);
  const [novaDescricaoAviso, setNovaDescricaoAviso] = useState("");
  const [novaDataExpiracaoAviso, setNovaDataExpiracaoAviso] = useState("");
  const [salvandoAviso, setSalvandoAviso] = useState(false);
  // Edição reaproveita o mesmo formulário (mesmo padrão de `abrirEdicaoFuncionario`) -
  // `avisoEditandoId` não nulo = formulário em modo "Editar aviso" em vez de "Novo aviso".
  const [avisoEditandoId, setAvisoEditandoId] = useState<number | null>(null);

  const [colunasKanban, setColunasKanban] = useState<StatusKanbanResponse[] | null>(null);
  const [erroKanban, setErroKanban] = useState<string | null>(null);
  const [novaColunaNome, setNovaColunaNome] = useState("");
  // Default marcado (pedido do Romulo) - só quem cadastra a coluna decide escondê-la.
  const [novaColunaVisivel, setNovaColunaVisivel] = useState(true);
  // Default desmarcado (pedido do Romulo) - coluna finalística = situação terminal do
  // fluxo; demanda nela ganha o botão "Arquivar" no card.
  const [novaColunaFinalistica, setNovaColunaFinalistica] = useState(false);
  // Default desmarcado (pedido do Romulo) - coluna recorrente = demandas diárias (limpeza,
  // portaria, ronda) que ficam ali indefinidamente e não contam no futuro dashboard de
  // tempo parado.
  const [novaColunaRecorrente, setNovaColunaRecorrente] = useState(false);
  const [salvandoColuna, setSalvandoColuna] = useState(false);
  // id da coluna sendo editada inline (nome/visibilidade/finalístico/recorrente) - null
  // quando nenhuma está em edição. `ordem` saiu daqui (pedido do Romulo: reordenar por
  // drag and drop, não mais digitando um número - ver `handleDropColuna` mais abaixo).
  const [colunaEditando, setColunaEditando] = useState<number | null>(null);
  const [edicaoColuna, setEdicaoColuna] = useState({
    nome: "",
    visivelExternamente: true,
    finalistico: false,
    recorrente: false,
  });
  const [salvandoEdicaoColuna, setSalvandoEdicaoColuna] = useState(false);
  const [excluindoColunaId, setExcluindoColunaId] = useState<number | null>(null);
  // Drag and drop pra reordenar as colunas (pedido do Romulo) - mesmo padrão nativo
  // (`dataTransfer`) já usado pra arrastar card entre colunas no Kanban (`kanban/page.tsx`).
  // `colunaArrastandoId` é a que está sendo arrastada; `colunaSobreId` é a que está por
  // baixo do cursor no momento (só pra destaque visual de "vai soltar aqui").
  const [colunaArrastandoId, setColunaArrastandoId] = useState<number | null>(null);
  const [colunaSobreId, setColunaSobreId] = useState<number | null>(null);
  const [salvandoOrdemColunas, setSalvandoOrdemColunas] = useState(false);

  const [etiquetas, setEtiquetas] = useState<EtiquetaResponse[] | null>(null);
  const [erroEtiquetas, setErroEtiquetas] = useState<string | null>(null);
  const [novaEtiquetaNome, setNovaEtiquetaNome] = useState("");
  const [novaEtiquetaCor, setNovaEtiquetaCor] = useState("#2F80ED");
  const [novaEtiquetaVisivelMorador, setNovaEtiquetaVisivelMorador] = useState(true);
  const [salvandoEtiqueta, setSalvandoEtiqueta] = useState(false);

  // Edição inline na própria linha - mesmo padrão das colunas do Kanban (`colunaEditando`).
  const [etiquetaEditando, setEtiquetaEditando] = useState<number | null>(null);
  const [edicaoEtiqueta, setEdicaoEtiqueta] = useState({ descricao: "", cor: "#2F80ED", visivelMorador: true });
  const [salvandoEdicaoEtiqueta, setSalvandoEdicaoEtiqueta] = useState(false);

  const [mensagensRapidas, setMensagensRapidas] = useState<MensagemRapidaResponse[] | null>(null);
  const [erroMensagensRapidas, setErroMensagensRapidas] = useState<string | null>(null);
  const [novaMensagemTexto, setNovaMensagemTexto] = useState("");
  const [novaMensagemCarater, setNovaMensagemCarater] = useState<MensagemRapidaCarater>("positivo");
  const [salvandoMensagemRapida, setSalvandoMensagemRapida] = useState(false);
  const [excluindoMensagemRapidaId, setExcluindoMensagemRapidaId] = useState<number | null>(null);

  // Edição inline na própria linha - mesmo padrão de `etiquetaEditando`.
  const [mensagemRapidaEditando, setMensagemRapidaEditando] = useState<number | null>(null);
  const [edicaoMensagemRapida, setEdicaoMensagemRapida] = useState<{ texto: string; carater: MensagemRapidaCarater }>({
    texto: "",
    carater: "positivo",
  });
  const [salvandoEdicaoMensagemRapida, setSalvandoEdicaoMensagemRapida] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    listarCondominios(sessao.token)
      .then(setCondominios)
      .catch((err) => setErroLista(err instanceof Error ? err.message : "Falha ao carregar."));
  }, [sessao]);

  const condominioIdAtual = typeof form === "number" ? form : null;
  const condominioAtual = condominios?.find((c) => c.id === condominioIdAtual) ?? null;

  // Debounce da busca (não bate uma request por tecla) - 400ms depois da última tecla,
  // `buscaEfetivaFuncionario` acompanha `buscaFuncionario` e dispara o fetch abaixo. A
  // página volta pra primeira junto (dentro do próprio timeout, não num efeito separado
  // reagindo a `buscaEfetivaFuncionario` - senão é setState síncrono dentro de efeito,
  // que o React desaconselha por causar re-render em cascata): resultado de uma busca
  // nova não é "a mesma listagem" da busca anterior, a página 2 de uma não tem relação
  // com a página 2 da outra.
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaEfetivaFuncionario(buscaFuncionario);
      setPaginaFuncionario(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [buscaFuncionario]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaEfetivaMorador(buscaMorador);
      setPaginaMorador(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [buscaMorador]);

  useEffect(() => {
    if (!sessao || !condominioIdAtual || aba !== "funcionarios") return;
    let cancelado = false;
    listarPaginaFuncionarios(sessao.token, condominioIdAtual, buscaEfetivaFuncionario, paginaFuncionario)
      .then((resultado) => {
        if (cancelado) return;
        setFuncionarios(resultado.itens);
        setTotalPaginasFuncionario(resultado.totalPaginas);
        setTotalItensFuncionario(resultado.totalItens);
        setErroFuncionarios(null);
      })
      .catch((err) => {
        if (!cancelado) setErroFuncionarios(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, condominioIdAtual, aba, paginaFuncionario, buscaEfetivaFuncionario]);

  useEffect(() => {
    if (!sessao || !condominioIdAtual || aba !== "moradores") return;
    let cancelado = false;
    listarPaginaMoradores(sessao.token, condominioIdAtual, buscaEfetivaMorador, paginaMorador)
      .then((resultado) => {
        if (cancelado) return;
        setMoradores(resultado.itens);
        setTotalPaginasMorador(resultado.totalPaginas);
        setTotalItensMorador(resultado.totalItens);
        setErroMoradores(null);
      })
      .catch((err) => {
        if (!cancelado) setErroMoradores(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, condominioIdAtual, aba, paginaMorador, buscaEfetivaMorador]);

  /** Reexecuta a busca paginada da página atual - usado depois de criar um funcionário,
   * pra refletir o registro novo (e o total/paginação atualizados) sem precisar trocar de
   * aba. Local-append não funciona mais com paginação de verdade: o registro novo pode
   * cair em qualquer posição (ordenado por nome) ou nem entrar na página atual. */
  function recarregarPaginaFuncionarios() {
    if (!sessao || !condominioIdAtual) return;
    listarPaginaFuncionarios(sessao.token, condominioIdAtual, buscaEfetivaFuncionario, paginaFuncionario)
      .then((resultado) => {
        setFuncionarios(resultado.itens);
        setTotalPaginasFuncionario(resultado.totalPaginas);
        setTotalItensFuncionario(resultado.totalItens);
      })
      .catch((err) => setErroFuncionarios(err instanceof Error ? err.message : "Falha ao carregar."));
  }

  /** Mesmo papel de `recarregarPaginaFuncionarios`, pra moradores. */
  function recarregarPaginaMoradores() {
    if (!sessao || !condominioIdAtual) return;
    listarPaginaMoradores(sessao.token, condominioIdAtual, buscaEfetivaMorador, paginaMorador)
      .then((resultado) => {
        setMoradores(resultado.itens);
        setTotalPaginasMorador(resultado.totalPaginas);
        setTotalItensMorador(resultado.totalItens);
      })
      .catch((err) => setErroMoradores(err instanceof Error ? err.message : "Falha ao carregar."));
  }

  // Bloco só existe pra condomínio tipo apartamento - carrega junto das abas Moradores
  // (pro select de unidade) e Blocos (cadastro/edição em si).
  useEffect(() => {
    if (
      !sessao ||
      !condominioIdAtual ||
      (aba !== "moradores" && aba !== "blocos") ||
      campos.tipo !== "apartamento"
    ) {
      return;
    }
    listarBlocos(sessao.token, condominioIdAtual)
      .then((lista) => {
        setBlocosCondominio(lista);
        setErroBlocos(null);
      })
      .catch((err) => {
        setBlocosCondominio([]);
        if (aba === "blocos") setErroBlocos(err instanceof Error ? err.message : "Falha ao carregar.");
      });
  }, [sessao, condominioIdAtual, aba, campos.tipo]);

  useEffect(() => {
    if (!sessao || !condominioIdAtual || aba !== "avisos") return;
    let cancelado = false;
    listarAvisosDoCondominio(sessao.token, condominioIdAtual)
      .then((lista) => {
        if (cancelado) return;
        setAvisos(lista);
        setErroAvisos(null);
      })
      .catch((err) => {
        if (!cancelado) setErroAvisos(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, condominioIdAtual, aba]);

  useEffect(() => {
    if (!sessao || !condominioIdAtual || aba !== "kanban") return;
    let cancelado = false;
    listarStatusKanban(sessao.token, condominioIdAtual)
      .then((lista) => {
        if (cancelado) return;
        setColunasKanban(lista);
        setErroKanban(null);
      })
      .catch((err) => {
        if (!cancelado) setErroKanban(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, condominioIdAtual, aba]);

  useEffect(() => {
    if (!sessao || !condominioIdAtual || aba !== "etiquetas") return;
    let cancelado = false;
    listarEtiquetas(sessao.token, condominioIdAtual)
      .then((lista) => {
        if (cancelado) return;
        setEtiquetas(lista);
        setErroEtiquetas(null);
      })
      .catch((err) => {
        if (!cancelado) setErroEtiquetas(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, condominioIdAtual, aba]);

  useEffect(() => {
    if (!sessao || !condominioIdAtual || aba !== "mensagens-rapidas") return;
    let cancelado = false;
    listarMensagensRapidas(sessao.token, condominioIdAtual)
      .then((lista) => {
        if (cancelado) return;
        setMensagensRapidas(lista);
        setErroMensagensRapidas(null);
      })
      .catch((err) => {
        if (!cancelado) setErroMensagensRapidas(err instanceof Error ? err.message : "Falha ao carregar.");
      });
    return () => {
      cancelado = true;
    };
  }, [sessao, condominioIdAtual, aba]);

  // Assim que o e-mail digitado parece válido, busca (debounced) se já existe
  // pessoa/funcionário com esse e-mail - é isso que evita pedir nome de novo pra quem já
  // está cadastrado. Não roda quando "Funcionário não tem e-mail" está marcado (LGPD,
  // v177 - sem e-mail não tem como procurar).
  useEffect(() => {
    if (!sessao || funcionarioEditandoId !== null || funcionarioSemEmail) return;
    const emailDigitado = novoFuncionario.email.trim();
    let cancelado = false;

    const timer = setTimeout(async () => {
      if (!EMAIL_REGEX.test(emailDigitado)) {
        if (!cancelado) {
          setPessoaEncontrada(null);
          setFuncionarioEncontrado(null);
          setErroBuscaEmail(null);
        }
        return;
      }
      setBuscandoEmail(true);
      setErroBuscaEmail(null);
      try {
        const [pessoa, funcionario] = await Promise.all([
          buscarPessoaPorEmail(sessao.token, emailDigitado),
          buscarFuncionarioPorEmail(sessao.token, emailDigitado),
        ]);
        if (!cancelado) {
          setPessoaEncontrada(pessoa);
          setFuncionarioEncontrado(funcionario);
        }
      } catch (err) {
        // Importante não deixar isso passar em silêncio como "pessoa não encontrada" -
        // uma falha de rede/servidor é bem diferente de "esse e-mail é novo".
        if (!cancelado) {
          setPessoaEncontrada(null);
          setFuncionarioEncontrado(null);
          setErroBuscaEmail(err instanceof Error ? err.message : "Falha ao verificar esse e-mail.");
        }
      } finally {
        if (!cancelado) setBuscandoEmail(false);
      }
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [sessao, novoFuncionario.email, funcionarioEditandoId, funcionarioSemEmail]);

  // Mesma ideia da busca de funcionário acima, pro e-mail do morador - não roda em modo
  // edição (o e-mail já é de uma pessoa confirmada, não precisa procurar de novo).
  useEffect(() => {
    if (!sessao || moradorEditandoId !== null) return;
    const emailDigitado = novoMorador.email.trim();
    let cancelado = false;

    const timer = setTimeout(async () => {
      if (!EMAIL_REGEX.test(emailDigitado)) {
        if (!cancelado) {
          setPessoaEncontradaMorador(null);
          setMoradorEncontrado(null);
          setErroBuscaEmailMorador(null);
        }
        return;
      }
      setBuscandoEmailMorador(true);
      setErroBuscaEmailMorador(null);
      try {
        const [pessoa, morador] = await Promise.all([
          buscarPessoaPorEmail(sessao.token, emailDigitado),
          buscarMoradorPorEmail(sessao.token, emailDigitado),
        ]);
        if (!cancelado) {
          setPessoaEncontradaMorador(pessoa);
          setMoradorEncontrado(morador);
        }
      } catch (err) {
        if (!cancelado) {
          setPessoaEncontradaMorador(null);
          setMoradorEncontrado(null);
          setErroBuscaEmailMorador(err instanceof Error ? err.message : "Falha ao verificar esse e-mail.");
        }
      } finally {
        if (!cancelado) setBuscandoEmailMorador(false);
      }
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [sessao, novoMorador.email, moradorEditandoId]);

  const condominiosFiltrados = useMemo(() => {
    if (!condominios) return condominios;
    const buscaTexto = busca.trim().toLowerCase();
    const buscaDigitos = apenasDigitos(busca);
    return condominios.filter((c) => {
      // `buscaDigitos.length > 0` evita que uma busca só de letras (sem nenhum dígito)
      // vire uma string vazia que "bate" com qualquer CNPJ (`"x".includes("")` é true).
      const bateBusca =
        !buscaTexto ||
        c.nome.toLowerCase().includes(buscaTexto) ||
        (buscaDigitos.length > 0 && c.cnpj.includes(buscaDigitos));
      const bateTipo = !filtroTipo || c.tipo === filtroTipo;
      return bateBusca && bateTipo;
    });
  }, [condominios, busca, filtroTipo]);

  if (!sessao) return null;

  function abrirNovo() {
    setCampos(FORM_VAZIO);
    setErroForm(null);
    setAba("condominio");
    setForm("novo");
  }

  function abrirEdicao(c: CondominioResponse) {
    setCampos({
      nome: c.nome,
      cnpj: formatarCnpj(c.cnpj),
      tipo: c.tipo,
      quantidadeCasas: c.quantidadeCasas ? String(c.quantidadeCasas) : "",
    });
    setErroForm(null);
    setAba("condominio");
    setForm(c.id);
  }

  function fecharForm() {
    setForm(null);
    setFuncionarios(null);
    setBuscaFuncionario("");
    setBuscaEfetivaFuncionario("");
    setPaginaFuncionario(0);
    setTotalPaginasFuncionario(0);
    setTotalItensFuncionario(0);
    setNovoFuncionario(FUNCIONARIO_VAZIO);
    setFuncionarioEditandoId(null);
    setMoradores(null);
    setBuscaMorador("");
    setBuscaEfetivaMorador("");
    setPaginaMorador(0);
    setTotalPaginasMorador(0);
    setTotalItensMorador(0);
    setNovoMorador(MORADOR_VAZIO);
    setMoradorEditandoId(null);
    setBlocosCondominio(null);
    setErroBlocos(null);
    setNovoBlocoNome("");
    setBlocoEditando(null);
    setAvisos(null);
    setNovaDescricaoAviso("");
    setNovaDataExpiracaoAviso("");
    setColunasKanban(null);
    setNovaColunaNome("");
    setColunaEditando(null);
    setEtiquetas(null);
    setNovaEtiquetaNome("");
    setNovaEtiquetaCor("#2F80ED");
    setNovaEtiquetaVisivelMorador(true);
    setEtiquetaEditando(null);
    setMensagensRapidas(null);
    setNovaMensagemTexto("");
    setNovaMensagemCarater("positivo");
    setMensagemRapidaEditando(null);
  }

  async function handleSalvarCondominio(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || form === null) return;
    setErroForm(null);
    setSalvando(true);
    const request = {
      nome: campos.nome,
      cnpj: apenasDigitos(campos.cnpj),
      tipo: campos.tipo,
      quantidadeCasas: campos.tipo === "casas" && campos.quantidadeCasas ? Number(campos.quantidadeCasas) : null,
    };
    try {
      if (form === "novo") {
        const novo = await criarCondominio(sessao.token, request);
        setCondominios((atual) => [...(atual ?? []), novo]);
        // Não fecha o formulário: agora que existe um id, as outras abas liberam.
        setForm(novo.id);
      } else {
        const atualizado = await atualizarCondominio(sessao.token, form, request);
        setCondominios((atual) => atual?.map((c) => (c.id === form ? atualizado : c)) ?? null);
      }
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /** GIF opcional do condomínio (pedido do Romulo) - some upload/remove atualiza o
   * `gifUrl` na lista de condomínios, refletindo na hora sem precisar recarregar. */
  async function handleUploadGifCondominio(arquivo: File) {
    if (!sessao || !condominioIdAtual) return;
    const atualizado = await uploadGifCondominio(sessao.token, condominioIdAtual, arquivo);
    setCondominios((atual) => atual?.map((c) => (c.id === condominioIdAtual ? atualizado : c)) ?? null);
  }

  async function handleRemoverGifCondominio() {
    if (!sessao || !condominioIdAtual) return;
    const atualizado = await removerGifCondominio(sessao.token, condominioIdAtual);
    setCondominios((atual) => atual?.map((c) => (c.id === condominioIdAtual ? atualizado : c)) ?? null);
  }

  async function handleAdicionarFuncionario(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroFuncionarios(null);
    setSalvandoFuncionario(true);
    try {
      const nomeFuncionario = pessoaEncontrada?.nome ?? novoFuncionario.nome;
      let funcionarioId: number;
      if (funcionarioEncontrado) {
        funcionarioId = funcionarioEncontrado.id;
      } else {
        const funcionario = await criarFuncionario(sessao.token, {
          nome: nomeFuncionario,
          email: funcionarioSemEmail ? null : pessoaEncontrada?.email ?? (novoFuncionario.email || null),
          telefone: apenasDigitos(novoFuncionario.telefone) || null,
        });
        funcionarioId = funcionario.id;
      }
      const perfil = novoFuncionario.perfil || null;
      const funcao = novoFuncionario.funcao.trim() || null;
      await criarVinculoFuncionario(sessao.token, funcionarioId, condominioIdAtual, perfil, funcao);
      // Local-append não serve mais com paginação de verdade (o registro novo pode cair
      // em qualquer posição, ou fora da página atual) - reexecuta a busca paginada.
      recarregarPaginaFuncionarios();
      setNovoFuncionario(FUNCIONARIO_VAZIO);
      setFuncionarioSemEmail(false);
      setPessoaEncontrada(null);
      setFuncionarioEncontrado(null);
    } catch (err) {
      setErroFuncionarios(err instanceof Error ? err.message : "Falha ao cadastrar funcionário.");
    } finally {
      setSalvandoFuncionario(false);
    }
  }

  /** Preenche o mesmo formulário "Adicionar funcionário" com o registro escolhido, em vez
   * de um formulário separado - e-mail/nome ficam travados (não é tela pra trocar de
   * pessoa), mas telefone e perfil ficam editáveis de verdade. Mesmo padrão de
   * `abrirEdicaoMorador`. */
  function abrirEdicaoFuncionario(f: FuncionarioDoCondominio) {
    setFuncionarioEditandoId(f.vinculoId);
    setNovoFuncionario({
      email: f.email ?? "",
      nome: f.nome,
      telefone: formatarTelefone(f.telefone),
      perfil: f.perfil ?? "",
      funcao: f.funcao ?? "",
    });
    setEmailBloqueadoFuncionario(!ehAdministrador && !!f.email);
    setErroFuncionarios(null);
    setErroLinhaFuncionario(null);
  }

  function cancelarEdicaoFuncionario() {
    setFuncionarioEditandoId(null);
    setNovoFuncionario(FUNCIONARIO_VAZIO);
    setFuncionarioSemEmail(false);
    setEmailBloqueadoFuncionario(false);
    setErroFuncionarios(null);
  }

  async function handleSalvarEdicaoFuncionario(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || funcionarioEditandoId === null) return;
    setErroFuncionarios(null);
    setSalvandoFuncionario(true);
    try {
      const perfil = novoFuncionario.perfil || null;
      const funcao = novoFuncionario.funcao.trim() || null;
      const telefone = apenasDigitos(novoFuncionario.telefone) || null;
      await atualizarVinculoFuncionario(
        sessao.token,
        funcionarioEditandoId,
        perfil,
        novoFuncionario.email,
        telefone,
        funcao,
      );
      setFuncionarios((atual) =>
        (atual ?? []).map((f) =>
          f.vinculoId === funcionarioEditandoId ? { ...f, perfil, funcao, email: novoFuncionario.email, telefone } : f,
        ),
      );
      cancelarEdicaoFuncionario();
    } catch (err) {
      setErroFuncionarios(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoFuncionario(false);
    }
  }

  async function handleDesativarFuncionario(f: FuncionarioDoCondominio) {
    if (!sessao) return;
    if (!window.confirm(`Remover "${f.nome}" desta lista? O vínculo fica inativo, mas os dados continuam guardados.`)) {
      return;
    }
    setErroLinhaFuncionario(null);
    try {
      await desativarVinculoFuncionario(sessao.token, f.vinculoId);
      setFuncionarios((atual) =>
        (atual ?? []).map((item) => (item.vinculoId === f.vinculoId ? { ...item, situacao: "inativo" } : item)),
      );
    } catch (err) {
      setErroLinhaFuncionario({
        id: f.vinculoId,
        mensagem: err instanceof Error ? err.message : "Falha ao remover.",
      });
    }
  }

  /** Botão só aparece dentro do formulário de edição, pro funcionário que está sendo
   * editado - mesmo padrão de `handleAtivarMorador`. */
  async function handleAtivarFuncionario() {
    if (!sessao || funcionarioEditandoId === null) return;
    setErroFuncionarios(null);
    setAtivandoFuncionario(true);
    try {
      await ativarVinculoFuncionario(sessao.token, funcionarioEditandoId);
      setFuncionarios((atual) =>
        (atual ?? []).map((item) =>
          item.vinculoId === funcionarioEditandoId ? { ...item, situacao: "ativo" } : item,
        ),
      );
    } catch (err) {
      setErroFuncionarios(err instanceof Error ? err.message : "Falha ao ativar.");
    } finally {
      setAtivandoFuncionario(false);
    }
  }

  /** `funcionarioEditandoId` guarda o id do VÍNCULO (funcionário-condomínio), não o
   * id do funcionário/pessoa que a API de foto espera - resolve pelo array já carregado. */
  const funcionarioEmEdicao = funcionarios?.find((f) => f.vinculoId === funcionarioEditandoId) ?? null;

  /** Sobe/remove a foto de perfil do funcionário sendo editado - a foto fica na
   * Pessoa por trás dele (ver PessoaFotoService), então esse controle só existe
   * em modo de edição (precisa de um funcionarioId já existente). */
  async function handleUploadFotoFuncionario(arquivo: File) {
    if (!sessao || !funcionarioEmEdicao) return;
    const atualizado = await uploadFotoFuncionario(sessao.token, funcionarioEmEdicao.funcionarioId, arquivo);
    setFuncionarios((atual) =>
      (atual ?? []).map((f) => (f.vinculoId === funcionarioEditandoId ? { ...f, fotoUrl: atualizado.fotoUrl } : f)),
    );
  }

  async function handleRemoverFotoFuncionario() {
    if (!sessao || !funcionarioEmEdicao) return;
    await removerFotoFuncionario(sessao.token, funcionarioEmEdicao.funcionarioId);
    setFuncionarios((atual) =>
      (atual ?? []).map((f) => (f.vinculoId === funcionarioEditandoId ? { ...f, fotoUrl: null } : f)),
    );
  }

  /** Mesmo padrão de `handleZerarSenhaMorador`. */
  async function handleZerarSenhaFuncionario(f: FuncionarioDoCondominio) {
    if (!sessao) return;
    if (
      !window.confirm(
        `Zerar a senha de "${f.nome}"? A senha atual dele(a) deixa de funcionar e ele(a) vai precisar trocar no próximo login.`,
      )
    ) {
      return;
    }
    setErroLinhaFuncionario(null);
    setZerandoSenhaFuncionarioId(f.vinculoId);
    try {
      await zerarSenhaVinculoFuncionario(sessao.token, f.vinculoId);
      window.alert(
        `Senha de "${f.nome}" zerada - um e-mail foi enviado pro endereço cadastrado avisando a pessoa. Ela precisa ir em "Esqueceu sua senha?" na tela de login (informando o e-mail) pra receber o código e definir a senha nova.`,
      );
    } catch (err) {
      setErroLinhaFuncionario({
        id: f.vinculoId,
        mensagem: err instanceof Error ? err.message : "Falha ao zerar senha.",
      });
    } finally {
      setZerandoSenhaFuncionarioId(null);
    }
  }

  async function handleAdicionarMorador(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroMoradores(null);
    setSalvandoMorador(true);
    try {
      const nomeMorador = pessoaEncontradaMorador?.nome ?? novoMorador.nome;
      let moradorId: number;
      if (moradorEncontrado) {
        moradorId = moradorEncontrado.id;
      } else {
        const morador = await criarMorador(sessao.token, {
          nome: nomeMorador,
          email: pessoaEncontradaMorador?.email ?? novoMorador.email,
          telefone: apenasDigitos(novoMorador.telefone) || null,
        });
        moradorId = morador.id;
      }
      const blocoId = novoMorador.blocoId ? Number(novoMorador.blocoId) : null;
      await criarVinculoMorador(sessao.token, moradorId, condominioIdAtual, blocoId, novoMorador.numeroUnidade);
      // Mesmo motivo de `recarregarPaginaFuncionarios` - local-append não serve mais.
      recarregarPaginaMoradores();
      setNovoMorador(MORADOR_VAZIO);
      setPessoaEncontradaMorador(null);
      setMoradorEncontrado(null);
    } catch (err) {
      setErroMoradores(err instanceof Error ? err.message : "Falha ao cadastrar morador.");
    } finally {
      setSalvandoMorador(false);
    }
  }

  /** Preenche o mesmo formulário "Adicionar morador" com o registro escolhido, em vez de
   * editar inline na linha - e-mail/nome ficam travados (não é tela pra trocar de pessoa),
   * mas telefone e unidade/bloco ficam editáveis de verdade. */
  function abrirEdicaoMorador(m: MoradorDoCondominio) {
    setMoradorEditandoId(m.vinculoId);
    setNovoMorador({
      email: m.email ?? "",
      nome: m.nome,
      telefone: formatarTelefone(m.telefone),
      blocoId: m.blocoId ? String(m.blocoId) : "",
      numeroUnidade: m.numeroUnidade,
    });
    setEmailBloqueadoMorador(!ehAdministrador && !!m.email);
    setErroMoradores(null);
    setErroLinhaMorador(null);
  }

  function cancelarEdicaoMorador() {
    setMoradorEditandoId(null);
    setNovoMorador(MORADOR_VAZIO);
    setEmailBloqueadoMorador(false);
    setErroMoradores(null);
  }

  async function handleSalvarEdicaoMorador(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || moradorEditandoId === null) return;
    setErroMoradores(null);
    setSalvandoMorador(true);
    try {
      const blocoId = novoMorador.blocoId ? Number(novoMorador.blocoId) : null;
      const telefone = apenasDigitos(novoMorador.telefone) || null;
      await atualizarVinculoMorador(
        sessao.token,
        moradorEditandoId,
        blocoId,
        novoMorador.numeroUnidade,
        novoMorador.email,
        telefone,
      );
      setMoradores((atual) =>
        (atual ?? []).map((m) =>
          m.vinculoId === moradorEditandoId
            ? { ...m, blocoId, numeroUnidade: novoMorador.numeroUnidade, email: novoMorador.email, telefone }
            : m,
        ),
      );
      cancelarEdicaoMorador();
    } catch (err) {
      setErroMoradores(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoMorador(false);
    }
  }

  async function handleDesativarMorador(m: MoradorDoCondominio) {
    if (!sessao) return;
    if (!window.confirm(`Remover "${m.nome}" desta lista? O vínculo fica inativo, mas os dados continuam guardados.`)) {
      return;
    }
    setErroLinhaMorador(null);
    try {
      await desativarVinculoMorador(sessao.token, m.vinculoId);
      setMoradores((atual) =>
        (atual ?? []).map((item) => (item.vinculoId === m.vinculoId ? { ...item, situacao: "inativo" } : item)),
      );
    } catch (err) {
      setErroLinhaMorador({
        id: m.vinculoId,
        mensagem: err instanceof Error ? err.message : "Falha ao remover.",
      });
    }
  }

  /** Botão só aparece dentro do formulário de edição, pro morador que está sendo editado
   * (ver pedido do Romulo: "colocar no editar o campo pra ativar"). Reverte o
   * `handleDesativarMorador` e mantém o formulário aberto - dá pra já aproveitar e
   * corrigir e-mail/unidade na mesma passada, se precisar. */
  async function handleAtivarMorador() {
    if (!sessao || moradorEditandoId === null) return;
    setErroMoradores(null);
    setAtivandoMorador(true);
    try {
      await ativarVinculoMorador(sessao.token, moradorEditandoId);
      setMoradores((atual) =>
        (atual ?? []).map((item) => (item.vinculoId === moradorEditandoId ? { ...item, situacao: "ativo" } : item)),
      );
    } catch (err) {
      setErroMoradores(err instanceof Error ? err.message : "Falha ao ativar.");
    } finally {
      setAtivandoMorador(false);
    }
  }

  /** "Esqueci minha senha" (tela de login) exige saber o e-mail e a senha atual - pra quem
   * nem a senha atual lembra mais, o síndico/sub-síndico/administrador zera aqui: o
   * backend gera um código temporário e manda pro e-mail cadastrado, ligando
   * `precisaTrocarSenha` de novo (ver `SenhaProvisoriaService`) - a pessoa usa esse código
   * como "senha atual" no mesmo "Esqueceu sua senha?" da tela de login. */
  async function handleZerarSenhaMorador(m: MoradorDoCondominio) {
    if (!sessao) return;
    if (
      !window.confirm(
        `Zerar a senha de "${m.nome}"? A senha atual dele(a) deixa de funcionar e ele(a) vai precisar trocar no próximo login.`,
      )
    ) {
      return;
    }
    setErroLinhaMorador(null);
    setZerandoSenhaId(m.vinculoId);
    try {
      await zerarSenhaVinculoMorador(sessao.token, m.vinculoId);
      window.alert(
        `Senha de "${m.nome}" zerada - um e-mail foi enviado pro endereço cadastrado avisando a pessoa. Ela precisa ir em "Esqueceu sua senha?" na tela de login (informando o e-mail) pra receber o código e definir a senha nova.`,
      );
    } catch (err) {
      setErroLinhaMorador({
        id: m.vinculoId,
        mensagem: err instanceof Error ? err.message : "Falha ao zerar senha.",
      });
    } finally {
      setZerandoSenhaId(null);
    }
  }

  async function handleSalvarAviso(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroAvisos(null);
    setSalvandoAviso(true);
    try {
      const dataExpiracao = novaDataExpiracaoAviso ? `${novaDataExpiracaoAviso}T00:00:00` : null;
      if (avisoEditandoId !== null) {
        const atualizado = await atualizarAviso(sessao.token, avisoEditandoId, {
          descricao: novaDescricaoAviso,
          dataExpiracao,
        });
        setAvisos((atual) => (atual ? ordenarAvisos(atual.map((a) => (a.id === avisoEditandoId ? atualizado : a))) : null));
        cancelarEdicaoAviso();
      } else {
        const novo = await criarAviso(sessao.token, {
          condominioId: condominioIdAtual,
          descricao: novaDescricaoAviso,
          dataExpiracao,
        });
        setAvisos((atual) => ordenarAvisos([novo, ...(atual ?? [])]));
        setNovaDescricaoAviso("");
        setNovaDataExpiracaoAviso("");
      }
    } catch (err) {
      setErroAvisos(err instanceof Error ? err.message : "Falha ao salvar aviso.");
    } finally {
      setSalvandoAviso(false);
    }
  }

  /** Preenche o mesmo formulário "Novo aviso" com o registro escolhido, em vez de um
   * formulário separado - mesmo padrão de `abrirEdicaoFuncionario`. Autor/condomínio não
   * ficam editáveis (não aparecem no formulário pra começar). */
  function abrirEdicaoAviso(a: AvisoResponse) {
    setAvisoEditandoId(a.id);
    setNovaDescricaoAviso(a.descricao);
    setNovaDataExpiracaoAviso(a.dataExpiracao ? a.dataExpiracao.slice(0, 10) : "");
    setErroAvisos(null);
  }

  function cancelarEdicaoAviso() {
    setAvisoEditandoId(null);
    setNovaDescricaoAviso("");
    setNovaDataExpiracaoAviso("");
    setErroAvisos(null);
  }

  async function handleDesativarAviso(id: number) {
    if (!sessao) return;
    setErroAvisos(null);
    try {
      const atualizado = await desativarAviso(sessao.token, id);
      setAvisos((atual) => atual?.map((a) => (a.id === id ? atualizado : a)) ?? null);
    } catch (err) {
      setErroAvisos(err instanceof Error ? err.message : "Falha ao desativar.");
    }
  }

  /** Fixado no topo primeiro, dentro disso mais recente primeiro - mesmo critério do
   * backend (`AvisoRepository.findByCondominioIdOrderByFixadoNoTopoDescCreatedAtDesc`),
   * pra reordenar a lista local sem precisar recarregar a página inteira. */
  function ordenarAvisos(lista: AvisoResponse[]): AvisoResponse[] {
    return [...lista].sort((a, b) => {
      if (a.fixadoNoTopo !== b.fixadoNoTopo) return a.fixadoNoTopo ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /** Só 1 fixado por condomínio (pedido do Romulo) - o backend já desfixa o anterior
   * sozinho, aqui só espelha isso no estado local pra não precisar recarregar a página. */
  async function handleFixarAviso(id: number) {
    if (!sessao) return;
    setErroAvisos(null);
    try {
      const atualizado = await fixarAvisoNoTopo(sessao.token, id);
      setAvisos((atual) =>
        atual ? ordenarAvisos(atual.map((a) => (a.id === id ? atualizado : { ...a, fixadoNoTopo: false }))) : null,
      );
    } catch (err) {
      setErroAvisos(err instanceof Error ? err.message : "Falha ao fixar no topo.");
    }
  }

  async function handleDesfixarAviso(id: number) {
    if (!sessao) return;
    setErroAvisos(null);
    try {
      const atualizado = await desfixarAvisoNoTopo(sessao.token, id);
      setAvisos((atual) => (atual ? ordenarAvisos(atual.map((a) => (a.id === id ? atualizado : a))) : null));
    } catch (err) {
      setErroAvisos(err instanceof Error ? err.message : "Falha ao desfixar.");
    }
  }

  async function handleCriarColuna(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroKanban(null);
    setSalvandoColuna(true);
    try {
      const novaOrdem = colunasKanban ? colunasKanban.length : 0;
      const nova = await criarStatusKanban(sessao.token, {
        condominioId: condominioIdAtual,
        nome: novaColunaNome,
        ordem: novaOrdem,
        visivelExternamente: novaColunaVisivel,
        finalistico: novaColunaFinalistica,
        recorrente: novaColunaRecorrente,
      });
      setColunasKanban((atual) => [...(atual ?? []), nova]);
      setNovaColunaNome("");
      setNovaColunaVisivel(true);
      setNovaColunaFinalistica(false);
      setNovaColunaRecorrente(false);
    } catch (err) {
      setErroKanban(err instanceof Error ? err.message : "Falha ao cadastrar coluna.");
    } finally {
      setSalvandoColuna(false);
    }
  }

  function abrirEdicaoColuna(c: StatusKanbanResponse) {
    setColunaEditando(c.id);
    setEdicaoColuna({
      nome: c.nome,
      visivelExternamente: c.visivelExternamente,
      finalistico: c.finalistico,
      recorrente: c.recorrente,
    });
  }

  /** Não toca em `ordem` - isso agora só muda por drag and drop (ver `handleDropColuna`). */
  async function handleSalvarEdicaoColuna(id: number) {
    if (!sessao) return;
    const colunaAtual = colunasKanban?.find((c) => c.id === id);
    if (!colunaAtual) return;
    setErroKanban(null);
    setSalvandoEdicaoColuna(true);
    try {
      const atualizada = await atualizarStatusKanban(sessao.token, id, {
        nome: edicaoColuna.nome,
        ordem: colunaAtual.ordem,
        visivelExternamente: edicaoColuna.visivelExternamente,
        finalistico: edicaoColuna.finalistico,
        recorrente: edicaoColuna.recorrente,
      });
      setColunasKanban((atual) => atual?.map((c) => (c.id === id ? atualizada : c)) ?? null);
      setColunaEditando(null);
    } catch (err) {
      setErroKanban(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoEdicaoColuna(false);
    }
  }

  /** Início do arraste - guarda qual coluna está sendo movida (mesmo padrão nativo de
   * `dataTransfer` já usado pra arrastar card entre colunas no Kanban). */
  function handleDragStartColuna(e: React.DragEvent<HTMLDivElement>, colunaId: number) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(colunaId));
    setColunaArrastandoId(colunaId);
  }

  function handleDragOverColuna(e: React.DragEvent<HTMLDivElement>, colunaId: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setColunaSobreId(colunaId);
  }

  function handleDragLeaveColuna(colunaId: number) {
    setColunaSobreId((atual) => (atual === colunaId ? null : atual));
  }

  /** Solta a coluna arrastada na posição da coluna de destino - desloca as colunas entre
   * as duas posições e renumera `ordem` sequencialmente (0, 1, 2...) pra não deixar buraco
   * nem duplicidade. Atualiza a tela na hora (otimista) e só manda ao backend as colunas
   * cujo `ordem` de fato mudou - a maioria de um arraste típico (subir/descer uma posição)
   * só afeta as colunas entre a origem e o destino, não todas. */
  async function handleDropColuna(e: React.DragEvent<HTMLDivElement>, colunaId: number) {
    e.preventDefault();
    setColunaSobreId(null);
    const idArrastada = colunaArrastandoId;
    setColunaArrastandoId(null);
    if (!sessao || !colunasKanban || idArrastada === null || idArrastada === colunaId) return;

    const indiceOrigem = colunasKanban.findIndex((c) => c.id === idArrastada);
    const indiceDestino = colunasKanban.findIndex((c) => c.id === colunaId);
    if (indiceOrigem === -1 || indiceDestino === -1) return;

    const reordenadas = [...colunasKanban];
    const [movida] = reordenadas.splice(indiceOrigem, 1);
    reordenadas.splice(indiceDestino, 0, movida);

    const comOrdemNova = reordenadas.map((c, i) => ({ ...c, ordem: i }));
    const mudaram = comOrdemNova.filter((c, i) => colunasKanban[i]?.id !== c.id || colunasKanban[i]?.ordem !== c.ordem);

    setColunasKanban(comOrdemNova);
    if (mudaram.length === 0) return;

    setErroKanban(null);
    setSalvandoOrdemColunas(true);
    try {
      await Promise.all(
        mudaram.map((c) =>
          atualizarStatusKanban(sessao.token, c.id, {
            nome: c.nome,
            ordem: c.ordem,
            visivelExternamente: c.visivelExternamente,
            finalistico: c.finalistico,
          }),
        ),
      );
    } catch (err) {
      setErroKanban(err instanceof Error ? err.message : "Falha ao reordenar - recarregando a lista.");
      // Estado local pode ter ficado dessincronizado do backend se só parte das
      // atualizações falhou - recarrega pra garantir que a tela reflete o que foi salvo
      // de verdade, em vez de confiar no otimismo do passo acima.
      if (condominioIdAtual) {
        listarStatusKanban(sessao.token, condominioIdAtual)
          .then(setColunasKanban)
          .catch(() => {});
      }
    } finally {
      setSalvandoOrdemColunas(false);
    }
  }

  /** Exclusão de verdade (pedido do Romulo) - só permitida enquanto a coluna não tiver
   * nenhuma demanda nela; o backend barra com 409 ("Retire os cards antes de excluir")
   * quando não for o caso, mensagem que cai direto no `erroKanban` já existente. */
  async function handleExcluirColuna(c: StatusKanbanResponse) {
    if (!sessao) return;
    if (!window.confirm(`Excluir a coluna "${c.nome}"? Essa ação não pode ser desfeita.`)) return;
    setErroKanban(null);
    setExcluindoColunaId(c.id);
    try {
      await excluirStatusKanban(sessao.token, c.id);
      setColunasKanban((atual) => atual?.filter((x) => x.id !== c.id) ?? null);
    } catch (err) {
      setErroKanban(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setExcluindoColunaId(null);
    }
  }

  async function handleCriarEtiqueta(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroEtiquetas(null);
    setSalvandoEtiqueta(true);
    try {
      const nova = await criarEtiqueta(sessao.token, {
        condominioId: condominioIdAtual,
        descricao: novaEtiquetaNome,
        cor: novaEtiquetaCor,
        visivelMorador: novaEtiquetaVisivelMorador,
      });
      setEtiquetas((atual) => [...(atual ?? []), nova]);
      setNovaEtiquetaNome("");
      setNovaEtiquetaVisivelMorador(true);
    } catch (err) {
      setErroEtiquetas(err instanceof Error ? err.message : "Falha ao cadastrar etiqueta.");
    } finally {
      setSalvandoEtiqueta(false);
    }
  }

  function abrirEdicaoEtiqueta(et: EtiquetaResponse) {
    setEtiquetaEditando(et.id);
    setEdicaoEtiqueta({ descricao: et.descricao, cor: et.cor, visivelMorador: et.visivelMorador });
    setErroEtiquetas(null);
  }

  async function handleSalvarEdicaoEtiqueta(id: number) {
    if (!sessao) return;
    setErroEtiquetas(null);
    setSalvandoEdicaoEtiqueta(true);
    try {
      const atualizada = await atualizarEtiqueta(sessao.token, id, {
        descricao: edicaoEtiqueta.descricao,
        cor: edicaoEtiqueta.cor,
        visivelMorador: edicaoEtiqueta.visivelMorador,
      });
      setEtiquetas((atual) => atual?.map((et) => (et.id === id ? atualizada : et)) ?? null);
      setEtiquetaEditando(null);
    } catch (err) {
      setErroEtiquetas(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoEdicaoEtiqueta(false);
    }
  }

  async function handleCriarMensagemRapida(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroMensagensRapidas(null);
    setSalvandoMensagemRapida(true);
    try {
      const nova = await criarMensagemRapida(sessao.token, {
        condominioId: condominioIdAtual,
        texto: novaMensagemTexto,
        carater: novaMensagemCarater,
      });
      setMensagensRapidas((atual) => [nova, ...(atual ?? [])]);
      setNovaMensagemTexto("");
      setNovaMensagemCarater("positivo");
    } catch (err) {
      setErroMensagensRapidas(err instanceof Error ? err.message : "Falha ao cadastrar mensagem.");
    } finally {
      setSalvandoMensagemRapida(false);
    }
  }

  function abrirEdicaoMensagemRapida(m: MensagemRapidaResponse) {
    setMensagemRapidaEditando(m.id);
    setEdicaoMensagemRapida({ texto: m.texto, carater: m.carater });
    setErroMensagensRapidas(null);
  }

  async function handleSalvarEdicaoMensagemRapida(id: number) {
    if (!sessao) return;
    setErroMensagensRapidas(null);
    setSalvandoEdicaoMensagemRapida(true);
    try {
      const atualizada = await atualizarMensagemRapida(sessao.token, id, {
        texto: edicaoMensagemRapida.texto,
        carater: edicaoMensagemRapida.carater,
      });
      setMensagensRapidas((atual) => atual?.map((m) => (m.id === id ? atualizada : m)) ?? null);
      setMensagemRapidaEditando(null);
    } catch (err) {
      setErroMensagensRapidas(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoEdicaoMensagemRapida(false);
    }
  }

  /** "Excluir" é soft-delete (situacao = inativo) - some da listagem, mesmo espírito de
   * Etiqueta/Aviso, sem apagar nada do banco. */
  async function handleExcluirMensagemRapida(id: number) {
    if (!sessao) return;
    setErroMensagensRapidas(null);
    setExcluindoMensagemRapidaId(id);
    try {
      await excluirMensagemRapida(sessao.token, id);
      setMensagensRapidas((atual) => atual?.filter((m) => m.id !== id) ?? null);
    } catch (err) {
      setErroMensagensRapidas(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setExcluindoMensagemRapidaId(null);
    }
  }

  async function handleCriarBloco(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !condominioIdAtual) return;
    setErroBlocos(null);
    setSalvandoBloco(true);
    try {
      const novo = await criarBloco(sessao.token, { condominioId: condominioIdAtual, nome: novoBlocoNome });
      setBlocosCondominio((atual) => [...(atual ?? []), novo]);
      setNovoBlocoNome("");
    } catch (err) {
      setErroBlocos(err instanceof Error ? err.message : "Falha ao cadastrar bloco.");
    } finally {
      setSalvandoBloco(false);
    }
  }

  function abrirEdicaoBloco(b: BlocoResponse) {
    setBlocoEditando(b.id);
    setEdicaoBlocoNome(b.nome);
    setErroBlocos(null);
  }

  async function handleSalvarEdicaoBloco(id: number) {
    if (!sessao) return;
    setErroBlocos(null);
    setSalvandoEdicaoBloco(true);
    try {
      const atualizado = await atualizarBloco(sessao.token, id, { nome: edicaoBlocoNome });
      setBlocosCondominio((atual) => atual?.map((b) => (b.id === id ? atualizado : b)) ?? null);
      setBlocoEditando(null);
    } catch (err) {
      setErroBlocos(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoEdicaoBloco(false);
    }
  }

  async function handleDesativar(c: CondominioResponse) {
    if (!sessao) return;
    if (!window.confirm(`Desativar "${c.nome}"? Ele deixa de aparecer como ativo, mas os dados continuam guardados.`)) {
      return;
    }
    setErroLinha(null);
    try {
      const atualizado = await desativarCondominio(sessao.token, c.id);
      setCondominios((atual) => atual?.map((x) => (x.id === c.id ? atualizado : x)) ?? null);
    } catch (err) {
      setErroLinha({ id: c.id, mensagem: err instanceof Error ? err.message : "Falha ao desativar." });
    }
  }

  /** Abre o modal do link público do Kanban - se o condomínio já tem um token, só mostra;
   * senão, o próprio modal oferece o botão "Gerar link" (`handleGerarLinkPublico`). */
  function abrirLinkPublico(c: CondominioResponse) {
    setLinkPublicoAberto(c);
    setErroLinkPublico(null);
    setLinkPublicoCopiado(false);
  }

  /** Idempotente no backend (devolve o mesmo token se já existir) - aqui só cobre o
   * caminho "ainda não tem link", já que o modal nem mostra esse botão quando já existe. */
  async function handleGerarLinkPublico() {
    if (!sessao || !linkPublicoAberto) return;
    setErroLinkPublico(null);
    setGerandoLinkPublico(true);
    try {
      const atualizado = await gerarLinkPublicoKanban(sessao.token, linkPublicoAberto.id);
      setCondominios((atual) => atual?.map((x) => (x.id === atualizado.id ? atualizado : x)) ?? null);
      setLinkPublicoAberto(atualizado);
    } catch (err) {
      setErroLinkPublico(err instanceof Error ? err.message : "Falha ao gerar o link.");
    } finally {
      setGerandoLinkPublico(false);
    }
  }

  /** Invalida o link atual na hora - quem já tinha salvo/colado o link antigo passa a
   * receber 404 ao abrir. Pede confirmação por ser irreversível (precisa gerar outro link
   * novo depois, o antigo não volta). */
  async function handleRevogarLinkPublico() {
    if (!sessao || !linkPublicoAberto) return;
    if (
      !window.confirm(
        "Revogar o link público? Quem já tiver esse link deixa de conseguir abrir o quadro. Dá pra gerar um link novo depois, mas o revogado não volta a funcionar.",
      )
    ) {
      return;
    }
    setErroLinkPublico(null);
    setRevogandoLinkPublico(true);
    try {
      const atualizado = await revogarLinkPublicoKanban(sessao.token, linkPublicoAberto.id);
      setCondominios((atual) => atual?.map((x) => (x.id === atualizado.id ? atualizado : x)) ?? null);
      setLinkPublicoAberto(atualizado);
    } catch (err) {
      setErroLinkPublico(err instanceof Error ? err.message : "Falha ao revogar o link.");
    } finally {
      setRevogandoLinkPublico(false);
    }
  }

  async function handleCopiarLinkPublico() {
    if (!linkPublicoAberto?.kanbanPublicoToken) return;
    try {
      await navigator.clipboard.writeText(urlKanbanPublico(linkPublicoAberto.kanbanPublicoToken));
      setLinkPublicoCopiado(true);
      setTimeout(() => setLinkPublicoCopiado(false), 2000);
    } catch {
      setErroLinkPublico("Não deu pra copiar automaticamente - selecione e copie o link manualmente.");
    }
  }

  const ehAdministrador = sessao.tipoPapel === "administrador";
  const ehFuncionario = sessao.tipoPapel === "funcionario";
  // Síndico/sub-síndico só gerenciam (editam info, cadastram funcionário) o PRÓPRIO
  // condomínio - nunca outro. Já o quadro de avisos é mais aberto: qualquer funcionário
  // do condomínio (qualquer perfil) pode ver/redigir/desativar aviso, igual já era antes
  // do administrador existir - só administrador não redige (não é funcionário de
  // nenhum lugar a não ser que troque de contexto).
  const ehGestor = ehFuncionario && (sessao.perfil === "sindico" || sessao.perfil === "sub_sindico");
  const ehFuncionarioDoCondominio = (c: CondominioResponse) => ehFuncionario && sessao.condominioId === c.id;
  // Quem pode ABRIR o painel de um condomínio específico (pelo menos pra ver os avisos).
  const podeAbrirPainel = (c: CondominioResponse) => ehAdministrador || ehFuncionarioDoCondominio(c);
  // Quem pode editar os dados do condomínio / cadastrar funcionário (mais restrito).
  const podeEditar = (c: CondominioResponse) => ehAdministrador || (ehGestor && sessao.condominioId === c.id);
  const podeAbrirAlgumPainel = ehAdministrador || ehFuncionario;
  // Mesma checagem de `podeEditar`, mas pro condomínio que está aberto no formulário
  // agora (não uma linha da grid) - "novo" só existe pra quem já é administrador
  // (só administrador vê o botão de criar), então cai certo nos dois casos.
  const podeEditarCondominioAtual = ehAdministrador || (ehGestor && sessao.condominioId === condominioIdAtual);
  // Só quem é funcionário DESTE condomínio pode redigir um aviso (precisa ser o autor);
  // administrador só vê/desativa (supervisão), a não ser que troque pro contexto de
  // funcionário desse condomínio.
  const podeRedigirAviso = ehFuncionario && sessao.condominioId === condominioIdAtual;
  // Etiqueta: qualquer funcionário deste condomínio (não só síndico/sub-síndico - mesmo
  // critério de quem pode criar direto no card do Kanban) ou administrador (gerenciando
  // um condomínio que não é o seu, como nas outras abas).
  const podeCriarEtiqueta = ehAdministrador || (ehFuncionario && sessao.condominioId === condominioIdAtual);
  // Mensagem rápida: mesmo critério de Etiqueta - qualquer funcionário deste condomínio
  // ou administrador (gerenciando um condomínio que não é o seu).
  const podeCriarMensagemRapida = ehAdministrador || (ehFuncionario && sessao.condominioId === condominioIdAtual);
  const podeCriarBloco = ehAdministrador || (ehFuncionario && sessao.condominioId === condominioIdAtual);
  const abaCondominioSalvo = typeof form === "number";
  const emailValidoFuncionario = EMAIL_REGEX.test(novoFuncionario.email.trim());
  const emailValidoMorador = EMAIL_REGEX.test(novoMorador.email.trim());

  return (
    <AppShell sessao={sessao}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Condomínios</h1>
        {ehAdministrador && !form && <Button onClick={abrirNovo}>+ Novo condomínio</Button>}
      </div>

      {form !== null && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white">
          <div className="flex border-b border-slate-200 px-5 pt-3">
            <button
              onClick={() => setAba("condominio")}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "condominio" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              }`}
            >
              Condomínio
            </button>
            {campos.tipo === "apartamento" && (
              <button
                onClick={() => abaCondominioSalvo && setAba("blocos")}
                disabled={!abaCondominioSalvo}
                title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
                className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                  aba === "blocos" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
                } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
              >
                Blocos
              </button>
            )}
            <button
              onClick={() => abaCondominioSalvo && setAba("funcionarios")}
              disabled={!abaCondominioSalvo}
              title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "funcionarios" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Funcionários
            </button>
            <button
              onClick={() => abaCondominioSalvo && setAba("moradores")}
              disabled={!abaCondominioSalvo}
              title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "moradores" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Moradores
            </button>
            <button
              onClick={() => abaCondominioSalvo && setAba("avisos")}
              disabled={!abaCondominioSalvo}
              title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "avisos" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Avisos
            </button>
            <button
              onClick={() => abaCondominioSalvo && setAba("kanban")}
              disabled={!abaCondominioSalvo}
              title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "kanban" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Kanban
            </button>
            <button
              onClick={() => abaCondominioSalvo && setAba("etiquetas")}
              disabled={!abaCondominioSalvo}
              title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "etiquetas" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Etiquetas
            </button>
            <button
              onClick={() => abaCondominioSalvo && setAba("mensagens-rapidas")}
              disabled={!abaCondominioSalvo}
              title={!abaCondominioSalvo ? "Salve os dados do condomínio primeiro" : undefined}
              className={`border-b-2 px-3 pb-2 text-sm font-medium ${
                aba === "mensagens-rapidas" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"
              } ${!abaCondominioSalvo ? "cursor-not-allowed opacity-50" : ""}`}
            >
              Mensagens rápidas
            </button>
          </div>

          {aba === "condominio" && (
            <form onSubmit={handleSalvarCondominio} className="space-y-3 p-5">
              <Input
                required
                disabled={!podeEditarCondominioAtual}
                placeholder="Nome do condomínio"
                value={campos.nome}
                onChange={(e) => setCampos((c) => ({ ...c, nome: e.target.value }))}
              />
              <Input
                required
                disabled={!podeEditarCondominioAtual}
                placeholder="CNPJ"
                value={campos.cnpj}
                onChange={(e) => setCampos((c) => ({ ...c, cnpj: formatarCnpj(e.target.value) }))}
                maxLength={18}
              />
              <select
                value={campos.tipo}
                disabled={!podeEditarCondominioAtual}
                onChange={(e) => setCampos((c) => ({ ...c, tipo: e.target.value as CondominioTipo }))}
                className="block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <option value="apartamento">Apartamento</option>
                <option value="casas">Casas</option>
              </select>
              {campos.tipo === "casas" && (
                <Input
                  type="number"
                  min={0}
                  disabled={!podeEditarCondominioAtual}
                  placeholder="Quantidade de casas (opcional)"
                  value={campos.quantidadeCasas}
                  onChange={(e) => setCampos((c) => ({ ...c, quantidadeCasas: e.target.value }))}
                />
              )}

              {/* Só em modo edição - o backend precisa de um condominioId já existente pra
                  anexar o GIF (fica na própria tabela de condomínio, pedido do Romulo). */}
              {condominioIdAtual !== null && (
                <UploadGifCondominio
                  gifUrl={condominioAtual?.gifUrl ?? null}
                  token={sessao.token}
                  onEnviar={handleUploadGifCondominio}
                  onRemover={handleRemoverGifCondominio}
                />
              )}

              {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}
              {form === "novo" && !erroForm && (
                <p className="text-xs text-slate-400">
                  Salve pra liberar as outras abas e já cadastrar quem trabalha aqui.
                </p>
              )}
              {!podeEditarCondominioAtual && (
                <p className="text-xs text-slate-400">Só administrador, síndico ou sub-síndico pode editar.</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={fecharForm}>
                  {abaCondominioSalvo ? "Fechar" : "Cancelar"}
                </Button>
                {podeEditarCondominioAtual && (
                  <Button type="submit" disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar"}
                  </Button>
                )}
              </div>
            </form>
          )}

          {aba === "blocos" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              <p className="text-xs text-slate-400">
                Blocos/torres do condomínio - usados pra identificar a unidade de cada morador na aba Moradores.
              </p>

              {podeCriarBloco ? (
                <form onSubmit={handleCriarBloco} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Novo bloco</label>
                    <Input
                      required
                      placeholder="ex: Bloco A, Torre 1"
                      value={novoBlocoNome}
                      onChange={(e) => setNovoBlocoNome(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={salvandoBloco}>
                    {salvandoBloco ? "Adicionando..." : "Adicionar"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Só funcionário deste condomínio ou administrador pode cadastrar bloco.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                {erroBlocos && <p className="text-sm text-red-600">{erroBlocos}</p>}
                {blocosCondominio === null && !erroBlocos && <p className="text-sm text-slate-500">Carregando...</p>}
                {blocosCondominio?.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhum bloco cadastrado ainda neste condomínio.</p>
                )}
                {blocosCondominio && blocosCondominio.length > 0 && (
                  <div className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Blocos
                    </div>
                    <div className="divide-y divide-slate-100">
                      {blocosCondominio.map((b) =>
                        blocoEditando === b.id ? (
                          <div key={b.id} className="flex items-center gap-2 p-4">
                            <Input
                              value={edicaoBlocoNome}
                              onChange={(e) => setEdicaoBlocoNome(e.target.value)}
                              className="flex-1"
                            />
                            <div className="flex shrink-0 gap-2">
                              <Button type="button" variant="secondary" onClick={() => setBlocoEditando(null)}>
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleSalvarEdicaoBloco(b.id)}
                                disabled={salvandoEdicaoBloco}
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div key={b.id} className="flex items-center justify-between gap-3 p-4">
                            <span className="text-sm text-slate-900">{b.nome}</span>
                            {podeCriarBloco && (
                              <button
                                onClick={() => abrirEdicaoBloco(b)}
                                title="Editar"
                                disabled={blocoEditando !== null}
                                className="text-slate-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLapis className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === "funcionarios" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              {podeEditarCondominioAtual ? (
                <form
                  onSubmit={funcionarioEditandoId !== null ? handleSalvarEdicaoFuncionario : handleAdicionarFuncionario}
                  className="space-y-3"
                >
                  <p className="text-sm font-medium text-slate-700">
                    {funcionarioEditandoId !== null ? "Editar funcionário" : "Adicionar funcionário"}
                  </p>

                  {/* Só em modo edição - o backend precisa de um funcionarioId já existente
                      pra anexar a foto (fica na Pessoa por trás, ver PessoaFotoService). */}
                  {funcionarioEditandoId !== null && funcionarioEmEdicao && (
                    <UploadFotoPerfil
                      fotoUrl={funcionarioEmEdicao.fotoUrl}
                      nome={funcionarioEmEdicao.nome}
                      token={sessao.token}
                      onEnviar={handleUploadFotoFuncionario}
                      onRemover={handleRemoverFotoFuncionario}
                    />
                  )}

                  {/* E-mail é o primeiro campo (pedido do Romulo, LGPD v177) - digitar um
                      e-mail já cadastrado associa a pessoa existente ao condomínio; um novo
                      revela nome/telefone pra cadastrar. "Funcionário não tem e-mail" pula a
                      busca de propósito - sem e-mail não tem como saber se a pessoa já existe
                      (efeito colateral aceito, ver HANDOFF.md). */}
                  {funcionarioEditandoId === null && (
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={funcionarioSemEmail}
                        onChange={(e) => {
                          setFuncionarioSemEmail(e.target.checked);
                          setNovoFuncionario((f) => ({ ...f, email: "" }));
                          setPessoaEncontrada(null);
                          setFuncionarioEncontrado(null);
                          setErroBuscaEmail(null);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      Funcionário não tem e-mail
                    </label>
                  )}

                  {!(funcionarioEditandoId === null && funcionarioSemEmail) && (
                    <div>
                      <Input
                        required={novoFuncionario.perfil !== ""}
                        type="email"
                        placeholder={novoFuncionario.perfil !== "" ? "E-mail" : "E-mail (opcional sem perfil)"}
                        value={novoFuncionario.email}
                        onChange={(e) => setNovoFuncionario((f) => ({ ...f, email: e.target.value }))}
                        disabled={funcionarioEditandoId !== null && emailBloqueadoFuncionario}
                      />
                      {funcionarioEditandoId !== null && emailBloqueadoFuncionario && (
                        <p className="mt-1 text-xs text-slate-400">
                          Só administrador pode trocar o e-mail de quem já tem um cadastrado.
                        </p>
                      )}
                    </div>
                  )}

                  {funcionarioEditandoId !== null ? (
                    // Nome fica só pra contexto (quem estou editando) - e-mail/nome não
                    // mudam por essa tela, trocar de pessoa é criar um vínculo novo.
                    <Input value={novoFuncionario.nome} disabled />
                  ) : (
                    <>
                      {!funcionarioSemEmail && buscandoEmail && (
                        <p className="text-xs text-slate-400">Buscando...</p>
                      )}
                      {!funcionarioSemEmail && erroBuscaEmail && (
                        <p className="text-xs text-red-600">{erroBuscaEmail}</p>
                      )}

                      {!funcionarioSemEmail && emailValidoFuncionario && !buscandoEmail && pessoaEncontrada && (
                        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                          <p className="text-slate-900">{pessoaEncontrada.nome}</p>
                          <p className="text-xs text-slate-400">
                            {funcionarioEncontrado
                              ? "Já é funcionário — só falta vincular a este condomínio."
                              : "Pessoa já cadastrada — só falta o perfil aqui."}
                          </p>
                        </div>
                      )}

                      {(funcionarioSemEmail ||
                        (emailValidoFuncionario && !buscandoEmail && !erroBuscaEmail && !pessoaEncontrada)) && (
                        <>
                          <Input
                            required
                            placeholder="Nome"
                            value={novoFuncionario.nome}
                            onChange={(e) => setNovoFuncionario((f) => ({ ...f, nome: e.target.value }))}
                          />
                          <Input
                            placeholder="Telefone (opcional)"
                            value={novoFuncionario.telefone}
                            onChange={(e) =>
                              setNovoFuncionario((f) => ({ ...f, telefone: formatarTelefone(e.target.value) }))
                            }
                          />
                        </>
                      )}
                    </>
                  )}

                  {funcionarioEditandoId !== null && (
                    <Input
                      placeholder="Telefone (opcional)"
                      value={novoFuncionario.telefone}
                      onChange={(e) => setNovoFuncionario((f) => ({ ...f, telefone: formatarTelefone(e.target.value) }))}
                    />
                  )}

                  <select
                    value={novoFuncionario.perfil}
                    onChange={(e) =>
                      setNovoFuncionario((f) => ({ ...f, perfil: e.target.value as FuncionarioPerfil | "" }))
                    }
                    className="block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sem perfil (sem acesso ao sistema)</option>
                    {Object.entries(PERFIL_LABEL).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>

                  {/* Só faz sentido pra quem não tem perfil (pedido do Romulo: identificar
                      o que a pessoa faz - jardineiro, rondista, etc. - já que "sem perfil"
                      sozinho não diz nada sobre a função de verdade). */}
                  {novoFuncionario.perfil === "" && (
                    <Input
                      placeholder="Função (ex: jardineiro, rondista)"
                      value={novoFuncionario.funcao}
                      onChange={(e) => setNovoFuncionario((f) => ({ ...f, funcao: e.target.value }))}
                    />
                  )}

                  {/* Reativar só aparece aqui dentro - mesmo padrão da edição de morador. */}
                  {funcionarioEditandoId !== null && funcionarioEmEdicao?.situacao === "inativo" && (
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-sm">
                      <p className="text-amber-700">Este funcionário está inativo.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleAtivarFuncionario}
                        disabled={ativandoFuncionario}
                      >
                        {ativandoFuncionario ? "Ativando..." : "Ativar funcionário"}
                      </Button>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    {funcionarioEditandoId !== null && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={cancelarEdicaoFuncionario}
                        disabled={salvandoFuncionario}
                      >
                        Cancelar
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        salvandoFuncionario ||
                        (funcionarioEditandoId === null &&
                          !funcionarioSemEmail &&
                          (!emailValidoFuncionario || buscandoEmail || !!erroBuscaEmail))
                      }
                    >
                      {funcionarioEditandoId !== null
                        ? salvandoFuncionario
                          ? "Salvando..."
                          : "Salvar"
                        : salvandoFuncionario
                          ? "Adicionando..."
                          : "Adicionar"}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Só administrador, síndico ou sub-síndico pode cadastrar funcionário.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                <Input
                  placeholder="Buscar funcionário por nome"
                  value={buscaFuncionario}
                  onChange={(e) => setBuscaFuncionario(e.target.value)}
                />
              </div>

              {erroFuncionarios && <p className="text-sm text-red-600">{erroFuncionarios}</p>}
              {funcionarios === null && !erroFuncionarios && (
                <p className="text-sm text-slate-500">Carregando...</p>
              )}
              {funcionarios?.length === 0 && (
                <p className="text-sm text-slate-500">
                  {buscaEfetivaFuncionario
                    ? "Nenhum funcionário bate com essa busca."
                    : "Nenhum funcionário cadastrado ainda neste condomínio."}
                </p>
              )}
              {funcionarios && funcionarios.length > 0 && (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      {podeEditarCondominioAtual && <th className="py-2 font-medium">Ações</th>}
                      <th className="py-2 font-medium">Nome</th>
                      <th className="py-2 font-medium">E-mail</th>
                      <th className="py-2 font-medium">Telefone</th>
                      <th className="py-2 font-medium">Perfil</th>
                      <th className="py-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funcionarios.map((f) => (
                      <tr key={f.vinculoId} className="border-b border-slate-100 last:border-0">
                        {podeEditarCondominioAtual && (
                          <td className="py-2">
                            <div className="flex items-center gap-3 text-slate-400">
                              <button
                                onClick={() => abrirEdicaoFuncionario(f)}
                                title="Editar"
                                disabled={funcionarioEditandoId !== null}
                                className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLapis className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDesativarFuncionario(f)}
                                title="Remover"
                                disabled={f.situacao === "inativo" || funcionarioEditandoId !== null}
                                className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLixeira className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleZerarSenhaFuncionario(f)}
                                title="Zerar senha (funcionário esqueceu a senha atual)"
                                disabled={funcionarioEditandoId !== null || zerandoSenhaFuncionarioId !== null}
                                className="hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeChave className="h-4 w-4" />
                              </button>
                            </div>
                            {erroLinhaFuncionario?.id === f.vinculoId && (
                              <p className="mt-1 text-xs text-red-600">{erroLinhaFuncionario.mensagem}</p>
                            )}
                          </td>
                        )}
                        <td className="py-2 text-slate-900">{f.nome}</td>
                        <td className="py-2 text-slate-500">{f.email ?? "—"}</td>
                        <td className="py-2 text-slate-500">{f.telefone ? formatarTelefone(f.telefone) : "—"}</td>
                        <td className="py-2 text-slate-500">
                          {f.perfil ? PERFIL_LABEL[f.perfil] : f.funcao || "Sem perfil"}
                        </td>
                        <td className="py-2">
                          <span
                            className={
                              f.situacao === "ativo"
                                ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                            }
                          >
                            {f.situacao === "ativo" ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {funcionarios && funcionarios.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>
                    {totalItensFuncionario} {totalItensFuncionario === 1 ? "funcionário" : "funcionários"} — página{" "}
                    {paginaFuncionario + 1} de {Math.max(totalPaginasFuncionario, 1)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPaginaFuncionario((p) => Math.max(p - 1, 0))}
                      disabled={paginaFuncionario === 0}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPaginaFuncionario((p) => Math.min(p + 1, totalPaginasFuncionario - 1))}
                      disabled={paginaFuncionario + 1 >= totalPaginasFuncionario}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {aba === "moradores" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              {podeEditarCondominioAtual ? (
                <form onSubmit={moradorEditandoId !== null ? handleSalvarEdicaoMorador : handleAdicionarMorador} className="space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    {moradorEditandoId !== null ? "Editar morador" : "Adicionar morador"}
                  </p>

                  {/* E-mail é o primeiro campo (pedido do Romulo, LGPD v177) - morador
                      sempre precisa ter e-mail (diferente de funcionário). Digitar um
                      e-mail já cadastrado associa a pessoa existente ao condomínio; um
                      novo revela nome/telefone pra cadastrar. */}
                  <div>
                    <Input
                      required
                      type="email"
                      placeholder="E-mail"
                      value={novoMorador.email}
                      onChange={(e) => setNovoMorador((m) => ({ ...m, email: e.target.value }))}
                      disabled={moradorEditandoId !== null && emailBloqueadoMorador}
                    />
                    {moradorEditandoId !== null && emailBloqueadoMorador && (
                      <p className="mt-1 text-xs text-slate-400">
                        Só administrador pode trocar o e-mail de quem já tem um cadastrado.
                      </p>
                    )}
                  </div>

                  {moradorEditandoId !== null ? (
                    // Nome fica só pra contexto (quem estou editando) - e-mail/nome não
                    // mudam por essa tela, trocar de pessoa é criar um vínculo novo.
                    <>
                      <Input value={novoMorador.nome} disabled />
                      <Input
                        placeholder="Telefone (opcional)"
                        value={novoMorador.telefone}
                        onChange={(e) => setNovoMorador((m) => ({ ...m, telefone: formatarTelefone(e.target.value) }))}
                      />
                    </>
                  ) : (
                    <>
                      {buscandoEmailMorador && <p className="text-xs text-slate-400">Buscando...</p>}
                      {erroBuscaEmailMorador && <p className="text-xs text-red-600">{erroBuscaEmailMorador}</p>}

                      {emailValidoMorador && !buscandoEmailMorador && pessoaEncontradaMorador && (
                        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
                          <p className="text-slate-900">{pessoaEncontradaMorador.nome}</p>
                          <p className="text-xs text-slate-400">
                            {moradorEncontrado
                              ? "Já é morador — só falta vincular a este condomínio."
                              : "Pessoa já cadastrada — só falta o bloco/unidade aqui."}
                          </p>
                        </div>
                      )}

                      {emailValidoMorador && !buscandoEmailMorador && !erroBuscaEmailMorador && !pessoaEncontradaMorador && (
                        <>
                          <Input
                            required
                            placeholder="Nome"
                            value={novoMorador.nome}
                            onChange={(e) => setNovoMorador((m) => ({ ...m, nome: e.target.value }))}
                          />
                          <Input
                            placeholder="Telefone (opcional)"
                            value={novoMorador.telefone}
                            onChange={(e) => setNovoMorador((m) => ({ ...m, telefone: formatarTelefone(e.target.value) }))}
                          />
                        </>
                      )}
                    </>
                  )}

                  {campos.tipo === "apartamento" && (
                    <select
                      value={novoMorador.blocoId}
                      onChange={(e) => setNovoMorador((m) => ({ ...m, blocoId: e.target.value }))}
                      className="block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sem bloco</option>
                      {(blocosCondominio ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}
                        </option>
                      ))}
                    </select>
                  )}
                  <Input
                    required
                    placeholder="Número da unidade (ex: apto 302, casa 12)"
                    value={novoMorador.numeroUnidade}
                    onChange={(e) => setNovoMorador((m) => ({ ...m, numeroUnidade: e.target.value }))}
                  />

                  {/* Reativar só aparece aqui dentro (pedido do Romulo) - some sozinho assim
                      que o vínculo volta a "ativo", sem precisar fechar/reabrir a edição. */}
                  {moradorEditandoId !== null &&
                    moradores?.find((m) => m.vinculoId === moradorEditandoId)?.situacao === "inativo" && (
                      <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-sm">
                        <p className="text-amber-700">Este morador está inativo.</p>
                        <Button type="button" variant="secondary" onClick={handleAtivarMorador} disabled={ativandoMorador}>
                          {ativandoMorador ? "Ativando..." : "Ativar morador"}
                        </Button>
                      </div>
                    )}

                  <div className="flex justify-end gap-2 pt-1">
                    {moradorEditandoId !== null && (
                      <Button type="button" variant="secondary" onClick={cancelarEdicaoMorador} disabled={salvandoMorador}>
                        Cancelar
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        salvandoMorador ||
                        (moradorEditandoId === null &&
                          (!emailValidoMorador || buscandoEmailMorador || !!erroBuscaEmailMorador))
                      }
                    >
                      {moradorEditandoId !== null
                        ? salvandoMorador
                          ? "Salvando..."
                          : "Salvar"
                        : salvandoMorador
                          ? "Adicionando..."
                          : "Adicionar"}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-slate-400">Só administrador, síndico ou sub-síndico pode cadastrar morador.</p>
              )}

              <div className="border-t border-slate-100 pt-4">
                <Input
                  placeholder="Buscar morador por nome"
                  value={buscaMorador}
                  onChange={(e) => setBuscaMorador(e.target.value)}
                />
              </div>

              {erroMoradores && <p className="text-sm text-red-600">{erroMoradores}</p>}
              {moradores === null && !erroMoradores && <p className="text-sm text-slate-500">Carregando...</p>}
              {moradores?.length === 0 && (
                <p className="text-sm text-slate-500">
                  {buscaEfetivaMorador
                    ? "Nenhum morador bate com essa busca."
                    : "Nenhum morador cadastrado ainda neste condomínio."}
                </p>
              )}
              {moradores && moradores.length > 0 && (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      {podeEditarCondominioAtual && <th className="py-2 font-medium">Ações</th>}
                      <th className="py-2 font-medium">Nome</th>
                      <th className="py-2 font-medium">E-mail</th>
                      <th className="py-2 font-medium">Telefone</th>
                      <th className="py-2 font-medium">Unidade</th>
                      <th className="py-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moradores.map((m) => (
                      <tr key={m.vinculoId} className="border-b border-slate-100 last:border-0">
                        {podeEditarCondominioAtual && (
                          <td className="py-2">
                            <div className="flex items-center gap-3 text-slate-400">
                              <button
                                onClick={() => abrirEdicaoMorador(m)}
                                title="Editar"
                                disabled={moradorEditandoId !== null}
                                className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLapis className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDesativarMorador(m)}
                                title="Remover"
                                disabled={m.situacao === "inativo" || moradorEditandoId !== null}
                                className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLixeira className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleZerarSenhaMorador(m)}
                                title="Zerar senha (morador esqueceu a senha atual)"
                                disabled={moradorEditandoId !== null || zerandoSenhaId !== null}
                                className="hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeChave className="h-4 w-4" />
                              </button>
                            </div>
                            {erroLinhaMorador?.id === m.vinculoId && (
                              <p className="mt-1 text-xs text-red-600">{erroLinhaMorador.mensagem}</p>
                            )}
                          </td>
                        )}
                        <td className="py-2 text-slate-900">{m.nome}</td>
                        <td className="py-2 text-slate-500">{m.email ?? "—"}</td>
                        <td className="py-2 text-slate-500">{m.telefone ? formatarTelefone(m.telefone) : "—"}</td>
                        <td className="py-2 text-slate-500">
                          {m.blocoId
                            ? `${blocosCondominio?.find((b) => b.id === m.blocoId)?.nome ?? "Bloco " + m.blocoId} — `
                            : ""}
                          {m.numeroUnidade}
                        </td>
                        <td className="py-2">
                          <span
                            className={
                              m.situacao === "ativo"
                                ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                            }
                          >
                            {m.situacao === "ativo" ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {moradores && moradores.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>
                    {totalItensMorador} {totalItensMorador === 1 ? "morador" : "moradores"} — página{" "}
                    {paginaMorador + 1} de {Math.max(totalPaginasMorador, 1)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPaginaMorador((p) => Math.max(p - 1, 0))}
                      disabled={paginaMorador === 0}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPaginaMorador((p) => Math.min(p + 1, totalPaginasMorador - 1))}
                      disabled={paginaMorador + 1 >= totalPaginasMorador}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {aba === "avisos" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              {podeRedigirAviso ? (
                <form onSubmit={handleSalvarAviso} className="space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    {avisoEditandoId !== null ? "Editar aviso" : "Novo aviso"}
                  </p>
                  <MarkdownEditor
                    required
                    maxLength={250}
                    placeholder="Descrição (máx. 250 caracteres)"
                    value={novaDescricaoAviso}
                    onChange={setNovaDescricaoAviso}
                    rows={3}
                  />
                  <div>
                    <label className="text-xs text-slate-500">Expira em (opcional)</label>
                    <Input
                      type="date"
                      value={novaDataExpiracaoAviso}
                      onChange={(e) => setNovaDataExpiracaoAviso(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    {avisoEditandoId !== null && (
                      <Button type="button" variant="secondary" onClick={cancelarEdicaoAviso} disabled={salvandoAviso}>
                        Cancelar
                      </Button>
                    )}
                    <Button type="submit" disabled={salvandoAviso}>
                      {avisoEditandoId !== null
                        ? salvandoAviso
                          ? "Salvando..."
                          : "Salvar"
                        : salvandoAviso
                          ? "Publicando..."
                          : "Publicar"}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Só funcionário deste condomínio pode redigir um aviso novo.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                {erroAvisos && <p className="text-sm text-red-600">{erroAvisos}</p>}
                {avisos === null && !erroAvisos && <p className="text-sm text-slate-500">Carregando...</p>}
                {avisos?.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhum aviso cadastrado ainda neste condomínio.</p>
                )}
                {avisos && avisos.length > 0 && (
                  <div className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Avisos
                    </div>
                    <div className="divide-y divide-slate-100">
                      {avisos.map((a) => (
                        <div key={a.id} className={a.fixadoNoTopo ? "bg-amber-50 p-4" : "p-4"}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2">
                              {a.fixadoNoTopo && (
                                <span title="Fixado no topo">
                                  <IconeFixado className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                </span>
                              )}
                              <Markdown texto={a.descricao} className="text-sm text-slate-900" />
                            </div>
                            <span
                              className={
                                a.situacao === "ativo"
                                  ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                  : "shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                              }
                            >
                              {a.situacao === "ativo" ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs italic text-slate-400">
                            Publicado por {a.funcionarioNome} em {formatarData(a.createdAt)}
                            {a.dataExpiracao && <> · válido até {formatarData(a.dataExpiracao)}</>}
                          </p>
                          {a.situacao === "ativo" && (
                            <div className="mt-2 flex gap-3">
                              <button
                                onClick={() => abrirEdicaoAviso(a)}
                                disabled={avisoEditandoId !== null}
                                className="text-xs text-slate-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => (a.fixadoNoTopo ? handleDesfixarAviso(a.id) : handleFixarAviso(a.id))}
                                disabled={avisoEditandoId !== null}
                                className="text-xs text-slate-400 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                {a.fixadoNoTopo ? "Desfixar do topo" : "Fixar no topo"}
                              </button>
                              <button
                                onClick={() => handleDesativarAviso(a.id)}
                                disabled={avisoEditandoId !== null}
                                className="text-xs text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                Desativar
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === "kanban" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              {podeEditarCondominioAtual ? (
                <form onSubmit={handleCriarColuna} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Nova coluna</label>
                    <Input
                      required
                      placeholder="ex: Em andamento"
                      value={novaColunaNome}
                      onChange={(e) => setNovaColunaNome(e.target.value)}
                    />
                  </div>
                  {/* Default marcado (pedido do Romulo) - desmarcar esconde a coluna E as
                      demandas nela do Kanban do morador (ver DemandaService.listar). */}
                  <label className="flex shrink-0 items-center gap-1.5 pb-3 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={novaColunaVisivel}
                      onChange={(e) => setNovaColunaVisivel(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Visível externamente
                  </label>
                  {/* Default desmarcado (pedido do Romulo) - coluna finalística = situação
                      terminal; demanda nela ganha o botão "Arquivar" no card do Kanban. */}
                  <label
                    className="flex shrink-0 items-center gap-1.5 pb-3 text-xs text-slate-500"
                    title="Situação terminal do fluxo - demanda nesta coluna pode ser arquivada no card"
                  >
                    <input
                      type="checkbox"
                      checked={novaColunaFinalistica}
                      onChange={(e) => setNovaColunaFinalistica(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Finalística
                  </label>
                  {/* Default desmarcado (pedido do Romulo) - coluna recorrente = demandas
                      diárias (limpeza, portaria, ronda) que ficam ali indefinidamente e não
                      contam no futuro dashboard de tempo parado. */}
                  <label
                    className="flex shrink-0 items-center gap-1.5 pb-3 text-xs text-slate-500"
                    title="Demandas diárias/recorrentes (ex: limpeza, portaria, ronda) - não contarão no futuro dashboard de tempo parado"
                  >
                    <input
                      type="checkbox"
                      checked={novaColunaRecorrente}
                      onChange={(e) => setNovaColunaRecorrente(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Recorrente
                  </label>
                  <Button type="submit" disabled={salvandoColuna}>
                    {salvandoColuna ? "Adicionando..." : "Adicionar"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Só administrador, síndico ou sub-síndico pode cadastrar coluna.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                {erroKanban && <p className="text-sm text-red-600">{erroKanban}</p>}
                {colunasKanban === null && !erroKanban && <p className="text-sm text-slate-500">Carregando...</p>}
                {colunasKanban?.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhuma coluna cadastrada ainda neste condomínio.</p>
                )}
                {colunasKanban && colunasKanban.length > 0 && (
                  <div className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Colunas do Kanban
                    </div>
                    {/* Pedido do Romulo: reordenar arrastando e soltando na posição
                        desejada, em vez de digitar um número de ordem - `salvandoOrdemColunas`
                        só desabilita visualmente durante o PATCH (a UI já reordenou
                        otimista antes disso, ver `handleDropColuna`). */}
                    <div className="divide-y divide-slate-100">
                      {colunasKanban.map((c) => (
                        <div
                          key={c.id}
                          draggable={podeEditarCondominioAtual && colunaEditando !== c.id}
                          onDragStart={(e) => handleDragStartColuna(e, c.id)}
                          onDragOver={(e) => handleDragOverColuna(e, c.id)}
                          onDragLeave={() => handleDragLeaveColuna(c.id)}
                          onDrop={(e) => handleDropColuna(e, c.id)}
                          onDragEnd={() => {
                            setColunaArrastandoId(null);
                            setColunaSobreId(null);
                          }}
                          className={`flex items-center justify-between gap-3 p-4 ${
                            colunaSobreId === c.id ? "bg-blue-50" : ""
                          } ${colunaArrastandoId === c.id ? "opacity-40" : ""}`}
                        >
                          {colunaEditando === c.id ? (
                            <>
                              <div className="flex flex-1 items-center gap-2">
                                <Input
                                  value={edicaoColuna.nome}
                                  onChange={(e) => setEdicaoColuna((v) => ({ ...v, nome: e.target.value }))}
                                  className="flex-1"
                                />
                                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                                  <input
                                    type="checkbox"
                                    checked={edicaoColuna.visivelExternamente}
                                    onChange={(e) =>
                                      setEdicaoColuna((v) => ({ ...v, visivelExternamente: e.target.checked }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  Visível externamente
                                </label>
                                <label
                                  className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500"
                                  title="Situação terminal do fluxo - demanda nesta coluna pode ser arquivada no card"
                                >
                                  <input
                                    type="checkbox"
                                    checked={edicaoColuna.finalistico}
                                    onChange={(e) =>
                                      setEdicaoColuna((v) => ({ ...v, finalistico: e.target.checked }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  Finalística
                                </label>
                                <label
                                  className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500"
                                  title="Demandas diárias/recorrentes (ex: limpeza, portaria, ronda) - não contarão no futuro dashboard de tempo parado"
                                >
                                  <input
                                    type="checkbox"
                                    checked={edicaoColuna.recorrente}
                                    onChange={(e) =>
                                      setEdicaoColuna((v) => ({ ...v, recorrente: e.target.checked }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  Recorrente
                                </label>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button type="button" variant="secondary" onClick={() => setColunaEditando(null)}>
                                  Cancelar
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => handleSalvarEdicaoColuna(c.id)}
                                  disabled={salvandoEdicaoColuna}
                                >
                                  Salvar
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="flex items-center text-sm text-slate-900">
                                {podeEditarCondominioAtual && (
                                  <span
                                    title="Arraste pra reordenar"
                                    className="mr-1.5 -ml-1 shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                                  >
                                    <IconeArrastar className="h-4 w-4" />
                                  </span>
                                )}
                                {c.nome} <span className="text-xs text-slate-400">— ordem {c.ordem}</span>
                                {!c.visivelExternamente && (
                                  <span className="ml-1 text-xs text-amber-600">— oculta pro morador</span>
                                )}
                                {c.finalistico && (
                                  <span className="ml-1 text-xs text-emerald-600">— finalística</span>
                                )}
                                {c.recorrente && (
                                  <span className="ml-1 text-xs text-purple-600">— recorrente</span>
                                )}
                              </p>
                              {podeEditarCondominioAtual && (
                                <div className="flex shrink-0 items-center gap-3 text-slate-400">
                                  <button
                                    onClick={() => abrirEdicaoColuna(c)}
                                    title="Editar"
                                    disabled={excluindoColunaId !== null || salvandoOrdemColunas}
                                    className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <IconeLapis className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleExcluirColuna(c)}
                                    title="Excluir"
                                    disabled={excluindoColunaId !== null || salvandoOrdemColunas}
                                    className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <IconeLixeira className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === "etiquetas" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              <p className="text-xs text-slate-400">
                Etiquetas &quot;padrão&quot; pra classificar demanda - já ficam prontas pra usar, mas não impedem
                funcionário de criar outras direto no card do Kanban.
              </p>

              {podeCriarEtiqueta ? (
                <form onSubmit={handleCriarEtiqueta} className="flex items-end gap-2">
                  <input
                    type="color"
                    value={novaEtiquetaCor}
                    onChange={(e) => setNovaEtiquetaCor(e.target.value)}
                    className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-200"
                  />
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Nova etiqueta</label>
                    <Input
                      required
                      maxLength={50}
                      placeholder="ex: Urgente"
                      value={novaEtiquetaNome}
                      onChange={(e) => setNovaEtiquetaNome(e.target.value)}
                    />
                  </div>
                  <label className="mb-3 flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={novaEtiquetaVisivelMorador}
                      onChange={(e) => setNovaEtiquetaVisivelMorador(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Visível para morador?
                  </label>
                  <Button type="submit" disabled={salvandoEtiqueta}>
                    {salvandoEtiqueta ? "Adicionando..." : "Adicionar"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Só funcionário deste condomínio ou administrador pode cadastrar etiqueta.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                {erroEtiquetas && <p className="text-sm text-red-600">{erroEtiquetas}</p>}
                {etiquetas === null && !erroEtiquetas && <p className="text-sm text-slate-500">Carregando...</p>}
                {etiquetas?.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhuma etiqueta cadastrada ainda neste condomínio.</p>
                )}
                {etiquetas && etiquetas.length > 0 && (
                  <div className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Etiquetas
                    </div>
                    <div className="divide-y divide-slate-100">
                      {etiquetas.map((et) =>
                        etiquetaEditando === et.id ? (
                          <div key={et.id} className="flex items-center gap-2 p-4">
                            <input
                              type="color"
                              value={edicaoEtiqueta.cor}
                              onChange={(e) => setEdicaoEtiqueta((v) => ({ ...v, cor: e.target.value }))}
                              className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-200"
                            />
                            <Input
                              maxLength={50}
                              value={edicaoEtiqueta.descricao}
                              onChange={(e) => setEdicaoEtiqueta((v) => ({ ...v, descricao: e.target.value }))}
                              className="flex-1"
                            />
                            <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                              <input
                                type="checkbox"
                                checked={edicaoEtiqueta.visivelMorador}
                                onChange={(e) =>
                                  setEdicaoEtiqueta((v) => ({ ...v, visivelMorador: e.target.checked }))
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Visível para morador?
                            </label>
                            <div className="flex shrink-0 gap-2">
                              <Button type="button" variant="secondary" onClick={() => setEtiquetaEditando(null)}>
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleSalvarEdicaoEtiqueta(et.id)}
                                disabled={salvandoEdicaoEtiqueta}
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div key={et.id} className="flex items-center justify-between gap-3 p-4">
                            <span className="flex items-center gap-2">
                              <span
                                className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                                style={{ backgroundColor: et.cor }}
                              >
                                {et.descricao}
                              </span>
                              {!et.visivelMorador && (
                                <span className="text-xs text-amber-600">— oculta pro morador</span>
                              )}
                            </span>
                            {podeCriarEtiqueta && (
                              <button
                                onClick={() => abrirEdicaoEtiqueta(et)}
                                title="Editar"
                                disabled={etiquetaEditando !== null}
                                className="text-slate-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLapis className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === "mensagens-rapidas" && condominioIdAtual && (
            <div className="space-y-4 p-5">
              <p className="text-xs text-slate-400">
                Mensagens prontas (até 150 caracteres) pra funcionário reaproveitar em vez de digitar do zero toda
                vez, marcadas como positiva ou negativa.
              </p>

              {podeCriarMensagemRapida ? (
                <form onSubmit={handleCriarMensagemRapida} className="flex items-end gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Caráter</label>
                    <select
                      value={novaMensagemCarater}
                      onChange={(e) => setNovaMensagemCarater(e.target.value as MensagemRapidaCarater)}
                      className="block h-11 rounded-lg border-0 bg-slate-100 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="positivo">Positiva</option>
                      <option value="negativo">Negativa</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Nova mensagem</label>
                    <Input
                      required
                      maxLength={150}
                      placeholder="ex: Obrigado pelo contato, já resolvemos!"
                      value={novaMensagemTexto}
                      onChange={(e) => setNovaMensagemTexto(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={salvandoMensagemRapida}>
                    {salvandoMensagemRapida ? "Adicionando..." : "Adicionar"}
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-slate-400">
                  Só funcionário deste condomínio ou administrador pode cadastrar mensagem rápida.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                {erroMensagensRapidas && <p className="text-sm text-red-600">{erroMensagensRapidas}</p>}
                {mensagensRapidas === null && !erroMensagensRapidas && (
                  <p className="text-sm text-slate-500">Carregando...</p>
                )}
                {mensagensRapidas?.length === 0 && (
                  <p className="text-sm text-slate-500">Nenhuma mensagem rápida cadastrada ainda neste condomínio.</p>
                )}
                {mensagensRapidas && mensagensRapidas.length > 0 && (
                  <div className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Mensagens rápidas
                    </div>
                    <div className="divide-y divide-slate-100">
                      {mensagensRapidas.map((m) =>
                        mensagemRapidaEditando === m.id ? (
                          <div key={m.id} className="flex items-center gap-2 p-4">
                            <select
                              value={edicaoMensagemRapida.carater}
                              onChange={(e) =>
                                setEdicaoMensagemRapida((v) => ({
                                  ...v,
                                  carater: e.target.value as MensagemRapidaCarater,
                                }))
                              }
                              className="h-11 shrink-0 rounded-lg border-0 bg-slate-100 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="positivo">Positiva</option>
                              <option value="negativo">Negativa</option>
                            </select>
                            <Input
                              maxLength={150}
                              value={edicaoMensagemRapida.texto}
                              onChange={(e) =>
                                setEdicaoMensagemRapida((v) => ({ ...v, texto: e.target.value }))
                              }
                              className="flex-1"
                            />
                            <div className="flex shrink-0 gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setMensagemRapidaEditando(null)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="button"
                                onClick={() => handleSalvarEdicaoMensagemRapida(m.id)}
                                disabled={salvandoEdicaoMensagemRapida}
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  m.carater === "positivo"
                                    ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                                    : "shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700"
                                }
                              >
                                {m.carater === "positivo" ? "Positiva" : "Negativa"}
                              </span>
                              <span className="text-sm text-slate-900">{m.texto}</span>
                            </div>
                            {podeCriarMensagemRapida && (
                              <div className="flex shrink-0 items-center gap-3 text-slate-400">
                                <button
                                  onClick={() => abrirEdicaoMensagemRapida(m)}
                                  title="Editar"
                                  disabled={mensagemRapidaEditando !== null || excluindoMensagemRapidaId !== null}
                                  className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <IconeLapis className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleExcluirMensagemRapida(m.id)}
                                  title="Excluir"
                                  disabled={mensagemRapidaEditando !== null || excluindoMensagemRapidaId !== null}
                                  className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <IconeLixeira className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {form === null && (
        <>
          <div className="mt-6 flex gap-3">
            <Input
              placeholder="Buscar por nome ou CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as CondominioTipo | "")}
              className="rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os tipos</option>
              <option value="apartamento">Apartamento</option>
              <option value="casas">Casas</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            {erroLista && <p className="p-4 text-sm text-red-600">{erroLista}</p>}
            {condominios === null && !erroLista && <p className="p-4 text-sm text-slate-500">Carregando...</p>}
            {condominios?.length === 0 && (
              <p className="p-4 text-sm text-slate-500">Nenhum condomínio cadastrado ainda.</p>
            )}
            {condominios && condominios.length > 0 && condominiosFiltrados?.length === 0 && (
              <p className="p-4 text-sm text-slate-500">Nenhum condomínio bate com esse filtro.</p>
            )}
            {condominiosFiltrados && condominiosFiltrados.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    {podeAbrirAlgumPainel && <th className="px-4 py-3 font-medium">Ações</th>}
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">CNPJ</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Funcionários</th>
                    <th className="px-4 py-3 font-medium">Moradores</th>
                    <th className="px-4 py-3 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {condominiosFiltrados.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      {podeAbrirAlgumPainel && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 text-slate-400">
                            {podeAbrirPainel(c) && (
                              <button
                                onClick={() => abrirEdicao(c)}
                                title={podeEditar(c) ? "Editar" : "Ver avisos e funcionários"}
                                className="hover:text-blue-600"
                              >
                                <IconeLapis className="h-4 w-4" />
                              </button>
                            )}
                            {podeEditar(c) && (
                              <button
                                onClick={() => abrirLinkPublico(c)}
                                title="Link público do Kanban (sem login)"
                                className={c.kanbanPublicoToken ? "text-blue-500 hover:text-blue-600" : "hover:text-blue-600"}
                              >
                                <IconeLink className="h-4 w-4" />
                              </button>
                            )}
                            {ehAdministrador && (
                              <button
                                onClick={() => handleDesativar(c)}
                                title="Desativar"
                                disabled={c.situacao === "inativo"}
                                className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <IconeLixeira className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          {erroLinha?.id === c.id && (
                            <p className="mt-1 text-xs text-red-600">{erroLinha.mensagem}</p>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Link href={`/condominios/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                          {c.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{c.cnpj}</td>
                      <td className="px-4 py-3 text-slate-500">{labelTipo(c)}</td>
                      <td className="px-4 py-3 text-slate-500">{c.quantidadeFuncionariosAtivos}</td>
                      <td className="px-4 py-3 text-slate-500">{c.quantidadeMoradoresAtivos}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            c.situacao === "ativo"
                              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
                              : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                          }
                        >
                          {c.situacao === "ativo" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Modal do link público do Kanban (pedido do Romulo) - mesmo padrão visual dos
          modais de detalhe já usados em kanban/page.tsx (overlay + card centralizado). */}
      {linkPublicoAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={() => setLinkPublicoAberto(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-900">Link público do Kanban — {linkPublicoAberto.nome}</p>
              <button
                type="button"
                onClick={() => setLinkPublicoAberto(null)}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Qualquer um com esse link vê o quadro Kanban sem precisar entrar no sistema - só as colunas
              marcadas como visíveis externamente e as demandas que não são sigilosas, sem abrir detalhe de
              nenhum card.
            </p>

            {linkPublicoAberto.kanbanPublicoToken ? (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={urlKanbanPublico(linkPublicoAberto.kanbanPublicoToken)}
                    onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 rounded-lg border-0 bg-slate-100 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button type="button" onClick={handleCopiarLinkPublico}>
                    {linkPublicoCopiado ? "Copiado!" : "Copiar"}
                  </Button>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRevogarLinkPublico}
                    disabled={revogandoLinkPublico}
                  >
                    {revogandoLinkPublico ? "Revogando..." : "Revogar link"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Nenhum link gerado ainda.</p>
                <Button type="button" onClick={handleGerarLinkPublico} disabled={gerandoLinkPublico}>
                  {gerandoLinkPublico ? "Gerando..." : "Gerar link"}
                </Button>
              </div>
            )}
            {erroLinkPublico && <p className="mt-2 text-xs text-red-600">{erroLinkPublico}</p>}
          </div>
        </div>
      )}
    </AppShell>
  );
}
