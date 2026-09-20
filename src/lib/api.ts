// Client mínimo pra API do backend (Java/Spring Boot).
// Default vazio = mesma origem do site (o servidor Next faz proxy de /api/* pro backend -
// ver `rewrites()` em next.config.ts). Assim o navegador só fala com UMA origem, o que
// funciona igual em localhost, IP da rede local ou domínio de tunel (ngrok), sem precisar
// rebuildar a imagem a cada teste. Ainda dá pra sobrescrever via NEXT_PUBLIC_API_URL se um
// dia precisar apontar o navegador direto pro backend (ex.: backend com domínio próprio).
import { BASE_PATH } from "./base-path";

// Com `basePath`, o proxy /api/* também passa a existir sob o prefixo (ex.: /commander/api/*).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? BASE_PATH;

/** Monta a URL final de uma imagem servida pelo backend (`DemandaDocumentoResponse.url`,
 * `fotoUrl`, `gifUrl` - agora um caminho relativo tipo `/api/.../arquivo`, não mais link
 * assinado do MinIO direto - ver HANDOFF.md). Esses endpoints exigem login como qualquer
 * outro, mas tag `<img src="...">`/`<a href="...">` não manda o header `Authorization`,
 * então o token vai pela query string - só esses caminhos específicos aceitam isso (ver
 * `JwtAuthenticationFilter` no backend), então não faz sentido reaproveitar em outro lugar. */
export function urlImagem(caminho: string, token: string): string {
  return `${API_URL}${caminho}?token=${encodeURIComponent(token)}`;
}

/** Envelope de paginação (pedido do Romulo: paginar Funcionários/Moradores do cadastro de
 * condomínio, 15 por página - "a ideia é performance para não listar todos de vez") -
 * espelha `PaginaResponse` do backend. */
export type PaginaResponse<T> = {
  itens: T[];
  pagina: number;
  totalPaginas: number;
  totalItens: number;
};

export type TipoPapel = "funcionario" | "morador" | "administrador";
export type FuncionarioPerfil = "sindico" | "sub_sindico" | "supervisor" | "encarregado";
export type CondominioTipo = "apartamento" | "casas";
export type Situacao = "ativo" | "inativo";

export const PERFIL_LABEL: Record<FuncionarioPerfil, string> = {
  sindico: "Síndico",
  sub_sindico: "Sub-síndico",
  supervisor: "Supervisor",
  encarregado: "Encarregado",
};

export type ContextoDto = {
  // null só no contexto de administrador - é um papel global, sem condomínio associado.
  condominioId: number | null;
  condominioNome: string | null;
  tipoPapel: TipoPapel;
  perfil: FuncionarioPerfil | null;
};

/** "Administrador (sem condomínio)", "{condomínio} — Síndico", "{condomínio} — Morador"...
 * usado na tela de login (escolha de contexto) e no modal de troca de perfil (AppShell). */
export function labelContexto(c: ContextoDto): string {
  if (c.tipoPapel === "administrador") return "Administrador (sem condomínio)";
  if (c.tipoPapel === "funcionario" && c.perfil) {
    return `${c.condominioNome} — ${PERFIL_LABEL[c.perfil]}`;
  }
  return `${c.condominioNome} — Morador`;
}

export type LoginResponse = {
  pessoaId: number;
  nome: string;
  contextos: ContextoDto[] | null;
  token: string | null;
  preAuthToken: string | null;
  /** Valor de `Pessoa.ultimoLogin` de ANTES deste login (null se é a primeira vez que essa
   * pessoa loga) - a tela de login guarda isso na sessão pra usar como "desde quando" no
   * alerta de mudança de status do morador (ver `AlertaMudancasStatus`). */
  ultimoLoginAnterior: string | null;
};

export type TokenResponse = {
  token: string;
};

export type ErrorResponse = {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  detalhes: string[] | null;
};

/** Lança um Error com a mensagem vinda do backend (ou um fallback) quando a resposta não é 2xx. */
async function parseOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const erro = body as ErrorResponse | null;
    throw new Error(erro?.message ?? `Erro inesperado (HTTP ${res.status})`);
  }
  return body as T;
}

/** Como `parseOrThrow`, mas 404 vira `null` em vez de erro - usado nos "buscar por cpf"
 * (não existir ainda é uma resposta válida, não uma falha). */
async function parseOrNullSe404<T>(res: Response): Promise<T | null> {
  if (res.status === 404) return null;
  return parseOrThrow<T>(res);
}

export async function login(cpf: string, senha: string): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, senha }),
  });
  return parseOrThrow<LoginResponse>(res);
}

/** Passo 1 de "Esqueci minha senha" - confirma que CPF + e-mail correspondem à mesma
 * pessoa (404 se não - vira erro, mesma mensagem tanto faz qual dos dois errou). */
export async function verificarIdentidade(cpf: string, email: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/verificar-identidade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, email }),
  });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

/** Passo 2 de "Esqueci minha senha" - troca a senha (CPF + e-mail de novo + senha atual)
 * e libera o login de verdade (desliga `Pessoa.precisaTrocarSenha` no backend). */
export async function trocarSenha(
  cpf: string,
  email: string,
  senhaAtual: string,
  novaSenha: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/trocar-senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, email, senhaAtual, novaSenha }),
  });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

export async function selecionarContexto(
  preAuthToken: string,
  condominioId: number | null,
  tipoPapel: TipoPapel,
): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/api/auth/contexto`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${preAuthToken}`,
    },
    body: JSON.stringify({ condominioId, tipoPapel }),
  });
  return parseOrThrow<TokenResponse>(res);
}

/** Contextos (condomínio + papel) que a pessoa JÁ LOGADA pode assumir - alimenta o modal
 * de troca de perfil sem precisar deslogar. */
export async function listarMeusContextos(token: string): Promise<ContextoDto[]> {
  const res = await fetch(`${API_URL}/api/auth/meus-contextos`, { headers: authHeaders(token) });
  return parseOrThrow<ContextoDto[]>(res);
}

/** Como `selecionarContexto`, mas com o token completo de quem já está logado (não o
 * preAuthToken) - troca de perfil sem passar pela tela de login de novo. */
export async function trocarContexto(
  token: string,
  condominioId: number | null,
  tipoPapel: TipoPapel,
): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/api/auth/trocar-contexto`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ condominioId, tipoPapel }),
  });
  return parseOrThrow<TokenResponse>(res);
}

export type CondominioResponse = {
  id: number;
  nome: string;
  cnpj: string;
  tipo: CondominioTipo;
  situacao: Situacao;
  quantidadeCasas: number | null;
  // Só vem preenchido quando tipo = apartamento (calculado no backend); null quando tipo = casas.
  quantidadeBlocos: number | null;
  // Funcionários com vínculo ativo nesse condomínio e situação global ativa (calculado no backend).
  quantidadeFuncionariosAtivos: number;
  // Mesma ideia, mas de morador (calculado no backend).
  quantidadeMoradoresAtivos: number;
  // GIF opcional (link assinado, expira em 15min) - null quando não tem um cadastrado.
  gifUrl: string | null;
  // Token do link público de leitura do Kanban (pedido do Romulo) - null quando nunca
  // gerado ou já revogado. Ver `gerarLinkPublicoKanban`/`urlKanbanPublico`.
  kanbanPublicoToken: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CondominioCreateRequest = {
  nome: string;
  cnpj: string;
  tipo: CondominioTipo;
  quantidadeCasas?: number | null;
};

export type CondominioUpdateRequest = CondominioCreateRequest;

/** Anexa `Authorization: Bearer <token>` - usar em toda chamada autenticada. */
function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function listarCondominios(token: string): Promise<CondominioResponse[]> {
  const res = await fetch(`${API_URL}/api/condominios`, { headers: authHeaders(token) });
  return parseOrThrow<CondominioResponse[]>(res);
}

export async function buscarCondominio(token: string, id: number): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios/${id}`, { headers: authHeaders(token) });
  return parseOrThrow<CondominioResponse>(res);
}

export async function criarCondominio(
  token: string,
  request: CondominioCreateRequest,
): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<CondominioResponse>(res);
}

export async function atualizarCondominio(
  token: string,
  id: number,
  request: CondominioUpdateRequest,
): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<CondominioResponse>(res);
}

export async function uploadGifCondominio(token: string, id: number, arquivo: File): Promise<CondominioResponse> {
  const corpo = new FormData();
  corpo.append("arquivo", arquivo);
  const res = await fetch(`${API_URL}/api/condominios/${id}/gif`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: corpo,
  });
  return parseOrThrow<CondominioResponse>(res);
}

export async function removerGifCondominio(token: string, id: number): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios/${id}/gif`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseOrThrow<CondominioResponse>(res);
}

/** Gera (ou devolve o já existente) o token do link público de leitura do Kanban -
 * pedido do Romulo: "deixar o kanban disponível em um link externo, independente do
 * usuário estar logado". Idempotente - chamar de novo com um link já gerado devolve o
 * MESMO token (`condominio.kanbanPublicoToken`), não troca. */
export async function gerarLinkPublicoKanban(token: string, id: number): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios/${id}/kanban-publico`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseOrThrow<CondominioResponse>(res);
}

/** Invalida o link público atual - qualquer link já compartilhado para de funcionar na hora. */
export async function revogarLinkPublicoKanban(token: string, id: number): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios/${id}/kanban-publico`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseOrThrow<CondominioResponse>(res);
}

/** Monta a URL completa do link público a partir do token - usada tanto pra mostrar
 * quanto pra copiar (`navigator.clipboard`). `window.location.origin` porque o backend
 * não sabe (nem precisa saber) em que origem o frontend está servido. */
export function urlKanbanPublico(token: string): string {
  return `${window.location.origin}${BASE_PATH}/kanban-publico/${token}`;
}

/** Card do quadro Kanban público - bem mais enxuto que `DemandaResponse` de propósito
 * (link sem login, sem detalhe de card - ver `KanbanPublicoService` no backend): sem
 * nome de solicitante/responsável, sem descrição, sem nota/etapa. */
export type CardKanbanPublicoResponse = {
  id: number;
  titulo: string;
  etiquetas: EtiquetaResponse[];
  temAnexos: boolean;
};

export type ColunaKanbanPublicaResponse = {
  id: number;
  nome: string;
  demandas: CardKanbanPublicoResponse[];
};

export type KanbanPublicoResponse = {
  condominioNome: string;
  colunas: ColunaKanbanPublicaResponse[];
};

/** Sem `authHeaders` de propósito - endpoint público, sem login (ver `SecurityConfig`,
 * `/api/kanban-publico/**` liberado). */
export async function buscarKanbanPublico(token: string): Promise<KanbanPublicoResponse> {
  const res = await fetch(`${API_URL}/api/kanban-publico/${token}`);
  return parseOrThrow<KanbanPublicoResponse>(res);
}

/** "Remover" na prática desativa (situacao = inativo) - não existe exclusão física, ver backend. */
export async function desativarCondominio(token: string, id: number): Promise<CondominioResponse> {
  const res = await fetch(`${API_URL}/api/condominios/${id}/desativar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<CondominioResponse>(res);
}

export type PessoaResponse = {
  id: number;
  nome: string;
  cpf: string;
  email: string | null;
};

/** null quando não existe nenhuma pessoa com esse CPF ainda (não é erro). */
export async function buscarPessoaPorCpf(token: string, cpf: string): Promise<PessoaResponse | null> {
  const res = await fetch(`${API_URL}/api/pessoas/buscar-por-cpf?cpf=${cpf}`, { headers: authHeaders(token) });
  return parseOrNullSe404<PessoaResponse>(res);
}

export type FuncionarioResponse = {
  id: number;
  nome: string;
  cpf: string;
  email: string | null;
  /** Link assinado (expira em 15min) - null quando a pessoa não tem foto cadastrada. */
  fotoUrl: string | null;
  situacao: Situacao;
  createdAt: string;
  updatedAt: string;
};

/** null quando o CPF ainda não tem papel de funcionário (mesmo que já exista como pessoa). */
export async function buscarFuncionarioPorCpf(token: string, cpf: string): Promise<FuncionarioResponse | null> {
  const res = await fetch(`${API_URL}/api/funcionarios/buscar-por-cpf?cpf=${cpf}`, { headers: authHeaders(token) });
  return parseOrNullSe404<FuncionarioResponse>(res);
}

export type FuncionarioCreateRequest = {
  nome: string;
  cpf: string;
  email: string | null;
};

/** Não recebe senha no cadastro - só reaproveita/cria a Pessoa e o papel de funcionário
 * (sem vínculo com condomínio nenhum ainda - isso é o passo seguinte, `criarVinculoFuncionario`). */
export async function criarFuncionario(
  token: string,
  request: FuncionarioCreateRequest,
): Promise<FuncionarioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<FuncionarioResponse>(res);
}

export async function buscarFuncionario(token: string, id: number): Promise<FuncionarioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios/${id}`, { headers: authHeaders(token) });
  return parseOrThrow<FuncionarioResponse>(res);
}

/** Sobe (ou substitui) a foto de perfil - fica na pessoa por trás do funcionário, então
 * vale pra qualquer outro papel que essa mesma pessoa tenha. */
export async function uploadFotoFuncionario(token: string, id: number, arquivo: File): Promise<FuncionarioResponse> {
  const corpo = new FormData();
  corpo.append("arquivo", arquivo);
  const res = await fetch(`${API_URL}/api/funcionarios/${id}/foto`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: corpo,
  });
  return parseOrThrow<FuncionarioResponse>(res);
}

export async function removerFotoFuncionario(token: string, id: number): Promise<FuncionarioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios/${id}/foto`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseOrThrow<FuncionarioResponse>(res);
}

export type FuncionarioCondominioResponse = {
  id: number;
  funcionarioId: number;
  condominioId: number;
  perfil: FuncionarioPerfil | null;
  /** Texto livre (jardineiro, rondista, etc.) - pedido do Romulo pra identificar quem
   * não tem perfil (sem acesso ao sistema), mas não é exigido nem restrito a esse caso. */
  funcao: string | null;
  situacao: Situacao;
  createdAt: string;
  updatedAt: string;
};

export async function listarVinculosPorCondominio(
  token: string,
  condominioId: number,
): Promise<FuncionarioCondominioResponse[]> {
  const res = await fetch(`${API_URL}/api/funcionarios-condominios?condominioId=${condominioId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<FuncionarioCondominioResponse[]>(res);
}

/** Já vem com nome/CPF/e-mail/foto embutidos - ver `FuncionarioCondominioResumoResponse`
 * no backend (elimina o `buscarFuncionario` por linha que a tela batia antes, um N+1 de
 * verdade). Usada pela aba Funcionário do cadastro de condomínio, paginada (pedido do
 * Romulo: 15 por página, "pra não listar todos de vez"). */
export type FuncionarioCondominioResumoResponse = {
  vinculoId: number;
  funcionarioId: number;
  nome: string;
  cpf: string;
  email: string | null;
  fotoUrl: string | null;
  perfil: FuncionarioPerfil | null;
  funcao: string | null;
  situacao: Situacao;
};

export async function listarPaginaFuncionarios(
  token: string,
  condominioId: number,
  busca: string,
  pagina: number,
  tamanho = 15,
): Promise<PaginaResponse<FuncionarioCondominioResumoResponse>> {
  const params = new URLSearchParams({ condominioId: String(condominioId), pagina: String(pagina), tamanho: String(tamanho) });
  if (busca.trim()) params.set("busca", busca.trim());
  const res = await fetch(`${API_URL}/api/funcionarios-condominios/pagina?${params}`, { headers: authHeaders(token) });
  return parseOrThrow<PaginaResponse<FuncionarioCondominioResumoResponse>>(res);
}

export async function criarVinculoFuncionario(
  token: string,
  funcionarioId: number,
  condominioId: number,
  perfil: FuncionarioPerfil | null,
  funcao: string | null,
): Promise<FuncionarioCondominioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios-condominios`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ funcionarioId, condominioId, perfil, funcao }),
  });
  return parseOrThrow<FuncionarioCondominioResponse>(res);
}

/** Só corrige perfil/e-mail/função - trocar de funcionário ou condomínio é um vínculo novo, não uma edição. */
export async function atualizarVinculoFuncionario(
  token: string,
  id: number,
  perfil: FuncionarioPerfil | null,
  email: string,
  funcao: string | null,
): Promise<FuncionarioCondominioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios-condominios/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ perfil, email, funcao }),
  });
  return parseOrThrow<FuncionarioCondominioResponse>(res);
}

/** "Remover" na prática desativa (situacao = inativo) - não existe exclusão física, mesmo padrão de `desativarVinculoMorador`. */
export async function desativarVinculoFuncionario(token: string, id: number): Promise<FuncionarioCondominioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios-condominios/${id}/desativar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<FuncionarioCondominioResponse>(res);
}

/** Reverte um `desativarVinculoFuncionario`. */
export async function ativarVinculoFuncionario(token: string, id: number): Promise<FuncionarioCondominioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios-condominios/${id}/ativar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<FuncionarioCondominioResponse>(res);
}

/** Reseta a senha da pessoa por trás do vínculo pra padrão (`Trocar@123`) e liga de novo
 * `precisaTrocarSenha` - pro funcionário que esqueceu a senha atual. Mesmo padrão de
 * `zerarSenhaVinculoMorador`. */
export async function zerarSenhaVinculoFuncionario(token: string, id: number): Promise<FuncionarioCondominioResponse> {
  const res = await fetch(`${API_URL}/api/funcionarios-condominios/${id}/zerar-senha`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<FuncionarioCondominioResponse>(res);
}

export type MoradorResponse = {
  id: number;
  nome: string;
  cpf: string;
  email: string | null;
  situacao: Situacao;
  createdAt: string;
  updatedAt: string;
};

export async function buscarMoradorPorCpf(token: string, cpf: string): Promise<MoradorResponse | null> {
  const res = await fetch(`${API_URL}/api/moradores/buscar-por-cpf?cpf=${cpf}`, { headers: authHeaders(token) });
  return parseOrNullSe404<MoradorResponse>(res);
}

export type MoradorCreateRequest = {
  nome: string;
  cpf: string;
  email: string;
};

/** Não recebe senha no cadastro - só reaproveita/cria a Pessoa e o papel de morador (sem
 * vínculo com condomínio nenhum ainda - isso é o passo seguinte, `criarVinculoMorador`). */
export async function criarMorador(token: string, request: MoradorCreateRequest): Promise<MoradorResponse> {
  const res = await fetch(`${API_URL}/api/moradores`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<MoradorResponse>(res);
}

export async function buscarMorador(token: string, id: number): Promise<MoradorResponse> {
  const res = await fetch(`${API_URL}/api/moradores/${id}`, { headers: authHeaders(token) });
  return parseOrThrow<MoradorResponse>(res);
}

export type MoradorCondominioResponse = {
  id: number;
  moradorId: number;
  condominioId: number;
  blocoId: number | null;
  numeroUnidade: string;
  situacao: Situacao;
  createdAt: string;
  updatedAt: string;
};

export async function listarVinculosMoradorPorCondominio(
  token: string,
  condominioId: number,
): Promise<MoradorCondominioResponse[]> {
  const res = await fetch(`${API_URL}/api/moradores-condominios?condominioId=${condominioId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<MoradorCondominioResponse[]>(res);
}

/** Já vem com nome/CPF/e-mail embutidos - ver `MoradorCondominioResumoResponse` no
 * backend (elimina o `buscarMorador` por linha que a tela batia antes). Usada pela aba
 * Morador do cadastro de condomínio, paginada (pedido do Romulo: 15 por página, "pra não
 * listar todos de vez"). */
export type MoradorCondominioResumoResponse = {
  vinculoId: number;
  moradorId: number;
  nome: string;
  cpf: string;
  email: string | null;
  blocoId: number | null;
  numeroUnidade: string;
  situacao: Situacao;
};

export async function listarPaginaMoradores(
  token: string,
  condominioId: number,
  busca: string,
  pagina: number,
  tamanho = 15,
): Promise<PaginaResponse<MoradorCondominioResumoResponse>> {
  const params = new URLSearchParams({ condominioId: String(condominioId), pagina: String(pagina), tamanho: String(tamanho) });
  if (busca.trim()) params.set("busca", busca.trim());
  const res = await fetch(`${API_URL}/api/moradores-condominios/pagina?${params}`, { headers: authHeaders(token) });
  return parseOrThrow<PaginaResponse<MoradorCondominioResumoResponse>>(res);
}

export async function criarVinculoMorador(
  token: string,
  moradorId: number,
  condominioId: number,
  blocoId: number | null,
  numeroUnidade: string,
): Promise<MoradorCondominioResponse> {
  const res = await fetch(`${API_URL}/api/moradores-condominios`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ moradorId, condominioId, blocoId, numeroUnidade }),
  });
  return parseOrThrow<MoradorCondominioResponse>(res);
}

/** Só corrige bloco/unidade - trocar de morador ou condomínio é um vínculo novo, não uma edição. */
export async function atualizarVinculoMorador(
  token: string,
  id: number,
  blocoId: number | null,
  numeroUnidade: string,
  email: string,
): Promise<MoradorCondominioResponse> {
  const res = await fetch(`${API_URL}/api/moradores-condominios/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ blocoId, numeroUnidade, email }),
  });
  return parseOrThrow<MoradorCondominioResponse>(res);
}

/** "Remover" na prática desativa (situacao = inativo) - não existe exclusão física, mesmo padrão de `desativarCondominio`. */
export async function desativarVinculoMorador(token: string, id: number): Promise<MoradorCondominioResponse> {
  const res = await fetch(`${API_URL}/api/moradores-condominios/${id}/desativar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<MoradorCondominioResponse>(res);
}

/** Reverte um `desativarVinculoMorador`. */
export async function ativarVinculoMorador(token: string, id: number): Promise<MoradorCondominioResponse> {
  const res = await fetch(`${API_URL}/api/moradores-condominios/${id}/ativar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<MoradorCondominioResponse>(res);
}

/** Reseta a senha da pessoa por trás do vínculo pra padrão (`Trocar@123`) e liga de novo
 * `precisaTrocarSenha` - pro morador que esqueceu a senha atual. Quem aciona precisa
 * avisar a pessoa da senha padrão por fora (a API não devolve o valor). */
export async function zerarSenhaVinculoMorador(token: string, id: number): Promise<MoradorCondominioResponse> {
  const res = await fetch(`${API_URL}/api/moradores-condominios/${id}/zerar-senha`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<MoradorCondominioResponse>(res);
}

export type BlocoResponse = {
  id: number;
  condominioId: number;
  nome: string;
};

export async function listarBlocos(token: string, condominioId: number): Promise<BlocoResponse[]> {
  const res = await fetch(`${API_URL}/api/blocos?condominioId=${condominioId}`, { headers: authHeaders(token) });
  return parseOrThrow<BlocoResponse[]>(res);
}

export type BlocoCreateRequest = {
  condominioId: number;
  nome: string;
};

export async function criarBloco(token: string, request: BlocoCreateRequest): Promise<BlocoResponse> {
  const res = await fetch(`${API_URL}/api/blocos`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<BlocoResponse>(res);
}

export type BlocoUpdateRequest = {
  nome: string;
};

/** Só corrige o nome - trocar de condomínio é um bloco novo, não uma edição. */
export async function atualizarBloco(token: string, id: number, request: BlocoUpdateRequest): Promise<BlocoResponse> {
  const res = await fetch(`${API_URL}/api/blocos/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<BlocoResponse>(res);
}

/** `fixadoNoTopo` (pedido do Romulo): reservado pra 1 aviso de "informações úteis" (ex:
 * telefones da administração) que deve sempre aparecer primeiro - o backend já devolve a
 * lista ordenada com ele na frente, só 1 por condomínio ao mesmo tempo. */
export type AvisoResponse = {
  id: number;
  condominioId: number;
  funcionarioId: number;
  funcionarioNome: string;
  descricao: string;
  situacao: Situacao;
  dataExpiracao: string | null;
  fixadoNoTopo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AvisoCreateRequest = {
  condominioId: number;
  descricao: string;
  dataExpiracao?: string | null;
};

/** Só descrição/expiração - autor e condomínio não mudam por essa tela. */
export type AvisoUpdateRequest = {
  descricao: string;
  dataExpiracao?: string | null;
};

/** O "mural": avisos visíveis agora no condomínio do PRÓPRIO contexto - é a tela que
 * funcionário/morador vê ao logar. Não serve pra administrador (ele não tem condomínio
 * próprio) - administrador usa `listarAvisosDoCondominio` na tela de gestão. */
export async function listarAvisosVisiveis(token: string): Promise<AvisoResponse[]> {
  const res = await fetch(`${API_URL}/api/avisos`, { headers: authHeaders(token) });
  return parseOrThrow<AvisoResponse[]>(res);
}

/** Visão de gestão: todos os avisos de UM condomínio (qualquer situação/expiração). */
export async function listarAvisosDoCondominio(token: string, condominioId: number): Promise<AvisoResponse[]> {
  const res = await fetch(`${API_URL}/api/avisos/todos?condominioId=${condominioId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<AvisoResponse[]>(res);
}

export async function criarAviso(token: string, request: AvisoCreateRequest): Promise<AvisoResponse> {
  const res = await fetch(`${API_URL}/api/avisos`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<AvisoResponse>(res);
}

export async function atualizarAviso(token: string, id: number, request: AvisoUpdateRequest): Promise<AvisoResponse> {
  const res = await fetch(`${API_URL}/api/avisos/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<AvisoResponse>(res);
}

export async function desativarAviso(token: string, id: number): Promise<AvisoResponse> {
  const res = await fetch(`${API_URL}/api/avisos/${id}/desativar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<AvisoResponse>(res);
}

/** Desfixa automaticamente qualquer outro aviso do mesmo condomínio que já estivesse
 * fixado - só 1 por vez (pedido do Romulo). */
export async function fixarAvisoNoTopo(token: string, id: number): Promise<AvisoResponse> {
  const res = await fetch(`${API_URL}/api/avisos/${id}/fixar-no-topo`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<AvisoResponse>(res);
}

export async function desfixarAvisoNoTopo(token: string, id: number): Promise<AvisoResponse> {
  const res = await fetch(`${API_URL}/api/avisos/${id}/desfixar-no-topo`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<AvisoResponse>(res);
}

/** Tarefa agendada: lembrete com título, descrição e 3 datas puras (yyyy-MM-dd, sem hora)
 * - data da tarefa, data do 1º aviso, data do 2º aviso. Só funcionário cadastra/vê, sempre
 * no condomínio do próprio contexto. O sininho do menu fica vermelho quando qualquer uma
 * das três datas de alguma tarefa é hoje. */
export type TarefaAgendadaResponse = {
  id: number;
  condominioId: number;
  funcionarioId: number;
  funcionarioNome: string;
  titulo: string;
  descricao: string;
  /** yyyy-MM-dd */
  dataTarefa: string;
  /** yyyy-MM-dd */
  dataPrimeiroAviso: string;
  /** yyyy-MM-dd */
  dataSegundoAviso: string;
  /** A menor das três datas - a listagem já vem ordenada por ela (crescente). */
  proximaDataRelevante: string;
  situacao: Situacao;
  createdAt: string;
  updatedAt: string;
};

export type TarefaAgendadaCreateRequest = {
  titulo: string;
  descricao: string;
  /** yyyy-MM-dd */
  dataTarefa: string;
  /** yyyy-MM-dd */
  dataPrimeiroAviso: string;
  /** yyyy-MM-dd */
  dataSegundoAviso: string;
};

/** Já vem ordenada por `proximaDataRelevante` crescente (o que vence primeiro no topo). */
export async function listarTarefasAgendadas(token: string): Promise<TarefaAgendadaResponse[]> {
  const res = await fetch(`${API_URL}/api/tarefas-agendadas`, { headers: authHeaders(token) });
  return parseOrThrow<TarefaAgendadaResponse[]>(res);
}

export async function criarTarefaAgendada(
  token: string,
  request: TarefaAgendadaCreateRequest,
): Promise<TarefaAgendadaResponse> {
  const res = await fetch(`${API_URL}/api/tarefas-agendadas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<TarefaAgendadaResponse>(res);
}

export type TarefaAgendadaUpdateRequest = TarefaAgendadaCreateRequest;

/** Só corrige título/descrição/datas - trocar de condomínio é uma tarefa nova, não uma edição. */
export async function atualizarTarefaAgendada(
  token: string,
  id: number,
  request: TarefaAgendadaUpdateRequest,
): Promise<TarefaAgendadaResponse> {
  const res = await fetch(`${API_URL}/api/tarefas-agendadas/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<TarefaAgendadaResponse>(res);
}

/** "Excluir" na aplicação é soft-delete (situacao = inativo) - não apaga nada do banco. */
export async function excluirTarefaAgendada(token: string, id: number): Promise<TarefaAgendadaResponse> {
  const res = await fetch(`${API_URL}/api/tarefas-agendadas/${id}/excluir`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<TarefaAgendadaResponse>(res);
}

export type StatusKanbanResponse = {
  id: number;
  condominioId: number;
  nome: string;
  ordem: number;
  /** false = coluna (e as demandas nela) oculta pro morador no Kanban. */
  visivelExternamente: boolean;
  /** true = situação terminal do fluxo - demanda nessa coluna pode ser arquivada no card. */
  finalistico: boolean;
  /** true = coluna de demandas recorrentes/diárias (ex: limpeza, portaria, ronda) - cards
   * ficam ali indefinidamente e não contam no futuro dashboard de tempo parado. */
  recorrente: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StatusKanbanCreateRequest = {
  condominioId: number;
  nome: string;
  ordem?: number | null;
  /** Omitido vira true no backend (default). */
  visivelExternamente?: boolean;
  /** Omitido vira false no backend (default). */
  finalistico?: boolean;
  /** Omitido vira false no backend (default). */
  recorrente?: boolean;
};

export type StatusKanbanUpdateRequest = {
  nome: string;
  ordem?: number | null;
  /** Omitido não mexe no valor atual. */
  visivelExternamente?: boolean;
  /** Omitido não mexe no valor atual. */
  finalistico?: boolean;
  /** Omitido não mexe no valor atual. */
  recorrente?: boolean;
};

export async function listarStatusKanban(token: string, condominioId: number): Promise<StatusKanbanResponse[]> {
  const res = await fetch(`${API_URL}/api/status-kanban?condominioId=${condominioId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<StatusKanbanResponse[]>(res);
}

export async function criarStatusKanban(
  token: string,
  request: StatusKanbanCreateRequest,
): Promise<StatusKanbanResponse> {
  const res = await fetch(`${API_URL}/api/status-kanban`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<StatusKanbanResponse>(res);
}

export async function atualizarStatusKanban(
  token: string,
  id: number,
  request: StatusKanbanUpdateRequest,
): Promise<StatusKanbanResponse> {
  const res = await fetch(`${API_URL}/api/status-kanban/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<StatusKanbanResponse>(res);
}

/** Exclusão de verdade (não é soft-delete) - só permitida enquanto a coluna não tiver
 * nenhuma demanda nela (o backend responde 409 com a mensagem "Retire os cards antes de
 * excluir" nesse caso). */
export async function excluirStatusKanban(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/status-kanban/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

/** Etiqueta (item 4.6) - cadastrada e gerenciada só por funcionário do condomínio
 * (qualquer perfil) ou administrador (qualquer condomínio); morador nunca cadastra/edita,
 * mas passa a RECEBER a etiqueta anexada numa demanda (em `DemandaResponse.etiquetas`)
 * quando ela está marcada como `visivelMorador`. */
export type EtiquetaResponse = {
  id: number;
  condominioId: number;
  descricao: string;
  cor: string;
  situacao: Situacao;
  /** Controla se a etiqueta aparece pro morador (nos cards/detalhe da demanda) -
   * funcionário sempre vê/gerencia, independente deste valor. */
  visivelMorador: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EtiquetaCreateRequest = {
  condominioId: number;
  descricao: string;
  cor: string;
  /** Omitido vira true - mesmo default do banco. */
  visivelMorador?: boolean;
};

/** Lista as etiquetas ATIVAS de um condomínio - funcionário desse condomínio, ou administrador. */
export async function listarEtiquetas(token: string, condominioId: number): Promise<EtiquetaResponse[]> {
  const res = await fetch(`${API_URL}/api/etiquetas?condominioId=${condominioId}`, { headers: authHeaders(token) });
  return parseOrThrow<EtiquetaResponse[]>(res);
}

export async function criarEtiqueta(token: string, request: EtiquetaCreateRequest): Promise<EtiquetaResponse> {
  const res = await fetch(`${API_URL}/api/etiquetas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<EtiquetaResponse>(res);
}

export type EtiquetaUpdateRequest = {
  descricao: string;
  cor: string;
  /** Omitido não mexe no valor atual. */
  visivelMorador?: boolean;
};

/** Corrige texto/cor/visibilidade pro morador - trocar de condomínio é uma etiqueta nova, não uma edição. */
export async function atualizarEtiqueta(
  token: string,
  id: number,
  request: EtiquetaUpdateRequest,
): Promise<EtiquetaResponse> {
  const res = await fetch(`${API_URL}/api/etiquetas/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<EtiquetaResponse>(res);
}

export type DemandaEtiquetaVincularRequest = {
  demandaId: number;
  etiquetaId: number;
};

/** Anexa uma etiqueta numa demanda - devolve a própria etiqueta anexada. */
export async function vincularEtiqueta(
  token: string,
  request: DemandaEtiquetaVincularRequest,
): Promise<EtiquetaResponse> {
  const res = await fetch(`${API_URL}/api/demanda-etiquetas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<EtiquetaResponse>(res);
}

/** Remove uma etiqueta de uma demanda. */
export async function desvincularEtiqueta(token: string, demandaId: number, etiquetaId: number): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/demanda-etiquetas?demandaId=${demandaId}&etiquetaId=${etiquetaId}`,
    { method: "DELETE", headers: authHeaders(token) },
  );
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

/** Mensagem rápida (pedido do Romulo): texto pronto por condomínio, pra funcionário
 * reaproveitar em vez de digitar do zero toda vez, marcado como positivo ou negativo. */
export type MensagemRapidaCarater = "positivo" | "negativo";

export type MensagemRapidaResponse = {
  id: number;
  condominioId: number;
  texto: string;
  carater: MensagemRapidaCarater;
  situacao: Situacao;
  createdAt: string;
  updatedAt: string;
};

export type MensagemRapidaCreateRequest = {
  condominioId: number;
  texto: string;
  carater: MensagemRapidaCarater;
};

/** Lista as mensagens rápidas ATIVAS de um condomínio - funcionário desse condomínio, ou administrador. */
export async function listarMensagensRapidas(token: string, condominioId: number): Promise<MensagemRapidaResponse[]> {
  const res = await fetch(`${API_URL}/api/mensagens-rapidas?condominioId=${condominioId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<MensagemRapidaResponse[]>(res);
}

export async function criarMensagemRapida(
  token: string,
  request: MensagemRapidaCreateRequest,
): Promise<MensagemRapidaResponse> {
  const res = await fetch(`${API_URL}/api/mensagens-rapidas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<MensagemRapidaResponse>(res);
}

export type MensagemRapidaUpdateRequest = {
  texto: string;
  carater: MensagemRapidaCarater;
};

/** Só corrige texto/caráter - trocar de condomínio é uma mensagem nova, não uma edição. */
export async function atualizarMensagemRapida(
  token: string,
  id: number,
  request: MensagemRapidaUpdateRequest,
): Promise<MensagemRapidaResponse> {
  const res = await fetch(`${API_URL}/api/mensagens-rapidas/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<MensagemRapidaResponse>(res);
}

/** "Excluir" na aplicação é soft-delete (situacao = inativo) - não apaga nada do banco. */
export async function excluirMensagemRapida(token: string, id: number): Promise<MensagemRapidaResponse> {
  const res = await fetch(`${API_URL}/api/mensagens-rapidas/${id}/excluir`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<MensagemRapidaResponse>(res);
}

export type DemandaStatusAprovacao = "pendente" | "aprovada" | "reprovada";

export type DemandaResponse = {
  id: number;
  condominioId: number;
  titulo: string;
  descricao: string;
  solicitanteTipo: "morador" | "funcionario";
  /** Null quando `identificarSolicitante` é false - mostrar como anônimo nesse caso. */
  solicitanteNome: string | null;
  identificarSolicitante: boolean;
  statusAprovacao: DemandaStatusAprovacao;
  statusKanbanId: number | null;
  statusKanbanNome: string | null;
  funcionarioResponsavelNome: string | null;
  funcionarioAprovadorNome: string | null;
  dataAprovacao: string | null;
  justificativaReprovacao: string | null;
  /** Só preenchida quando aprovada SEM Kanban (pedido do Romulo) - null nos outros casos. */
  justificativaAprovacao: string | null;
  sigilosa: boolean;
  /** Pedido do Romulo: true quando a demanda foi arquivada no card (só possível numa
   * coluna finalística). Card fica em estado arquivado e o botão "Arquivar" some. */
  arquivada: boolean;
  /** Item 4.8: só true pra síndico/sub-síndico do condomínio, ou pro funcionário que
   * marcou sigilosa - controla se a tela mostra a opção de indicar mais gente. */
  podeGerenciarSigilo: boolean;
  /** Funcionário recebe todas; morador só as marcadas como `visivelMorador` (ver
   * `DemandaService.listar`/`EtiquetaService`). */
  etiquetas: EtiquetaResponse[];
  /** Item 4.9: true se já tem pelo menos uma imagem anexada - controla o destaque
   * (verde/cinza) do ícone de upload no card do Kanban. */
  temAnexos: boolean;
  /** Pedido do Romulo: true quando tem pelo menos uma nota ainda não lida ou sem resposta -
   * controla o ícone de alerta no topo do card do Kanban. Visível pros dois papéis. */
  temNotaPendente: boolean;
  /** Pedido do Romulo: true quando tem pelo menos uma etapa com prazo vencido e ainda não
   * concluída - controla o contorno vermelho de destaque no card do Kanban. Vale pros dois
   * papéis desde a v136 (morador vê etapas em modo leitura desde a v134). */
  temEtapaVencida: boolean;
  /** Pedido do Romulo: true quando tem pelo menos uma etapa com prazo marcado, ainda não
   * vencido, e ainda não concluída - controla o contorno verde de destaque no card do
   * Kanban. Se a demanda tem etapa vencida E vigente ao mesmo tempo, o vermelho de
   * `temEtapaVencida` prevalece na UI. Mesmo espírito de `temEtapaVencida`: vale pros dois
   * papéis desde a v136. */
  temEtapaVigente: boolean;
  /** Funcionários atribuídos - alimenta o avatar (foto ou iniciais) no canto do card do
   * Kanban. Diferente de `etiquetas`, vem preenchido pra funcionário E morador. */
  responsaveis: { funcionarioId: number; nome: string; fotoUrl: string | null }[];
  /** Funcionalidade "Acompanhar" (pedido do Romulo): true quando o morador logado NÃO é
   * quem abriu essa demanda - controla se o card do Kanban mostra o check "Acompanhar".
   * Sempre false pra funcionário. */
  podeAcompanhar: boolean;
  /** true quando o morador logado marcou "Acompanhar" nessa demanda - reflete o check. */
  acompanhando: boolean;
  /** Desde quando a demanda está na coluna ATUAL dela (a transição mais recente do
   * histórico) - alimenta o KPI de "dias parado" do Kanban. Null enquanto não tem coluna
   * (statusKanbanId também null) ou nos endpoints que não calculam isso em lote (ex:
   * `/demandas/pagina`). */
  statusKanbanDesde: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DemandaCreateRequest = {
  titulo: string;
  descricao: string;
  sigilosa: boolean;
  identificarSolicitante: boolean;
};

/** Exatamente um dos dois: `statusKanbanId` manda pro Kanban, `justificativa` aprova sem
 * Kanban (pedido do Romulo, mesmo espírito de `DemandaReprovarRequest`). */
export type DemandaAprovarRequest =
  | { statusKanbanId: number; justificativa?: never }
  | { statusKanbanId?: never; justificativa: string };

export type DemandaReprovarRequest = {
  justificativa: string;
};

export type DemandaMoverKanbanRequest = {
  statusKanbanId: number;
};

/** Sempre no condomínio do PRÓPRIO contexto. Por padrão, funcionário vê todas e morador só
 * as que ele mesmo abriu (uso: `/demandas`, acompanhamento pessoal); `todas = true` faz
 * morador ver todas também, igual funcionário (uso: quadro Kanban, visão geral do
 * condomínio) - sigilo continua protegido nos dois casos, ver `DemandaService.listar`. */
export async function listarDemandas(token: string, todas = false): Promise<DemandaResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas?todas=${todas}`, { headers: authHeaders(token) });
  return parseOrThrow<DemandaResponse[]>(res);
}

/** Envelope de paginação de `/demandas` (pedido do Romulo: "paginar a listagem das
 * demandas em 20 registros") - espelha `DemandaPaginaResponse` do backend.
 * `existeNotaNaoLida`/`existeEtapaVencida` cobrem TODAS as demandas visíveis do
 * condomínio (sigilo incluído), não só a página atual - é o aviso ambiente do ícone no
 * topo, que precisa saber se tem algo em QUALQUER lugar da listagem, não só na página
 * exibida no momento. */
export type DemandaPaginaResponse = {
  itens: DemandaResponse[];
  pagina: number;
  totalPaginas: number;
  totalItens: number;
  existeNotaNaoLida: boolean;
  existeEtapaVencida: boolean;
};

/** Página da listagem pessoal de `/demandas` (mesma visibilidade de `listarDemandas`
 * sem `todas` - funcionário vê todas do condomínio, morador só as próprias). O quadro
 * Kanban continua usando `listarDemandas(token, true)` sem paginação - precisa da lista
 * inteira pra distribuir nas colunas. `status` aceita um valor de `DemandaStatusAprovacao`
 * OU `"kanban:<id>"` (mesma convenção do `<select>` de status da tela). */
export async function listarPaginaDemandas(
  token: string,
  filtros: {
    busca?: string;
    status?: string;
    notaNaoLida?: boolean;
    etapaVencida?: boolean;
    pagina?: number;
    tamanho?: number;
  },
): Promise<DemandaPaginaResponse> {
  const params = new URLSearchParams();
  if (filtros.busca?.trim()) params.set("busca", filtros.busca.trim());
  if (filtros.status) params.set("status", filtros.status);
  if (filtros.notaNaoLida) params.set("notaNaoLida", "true");
  if (filtros.etapaVencida) params.set("etapaVencida", "true");
  params.set("pagina", String(filtros.pagina ?? 0));
  params.set("tamanho", String(filtros.tamanho ?? 20));
  const res = await fetch(`${API_URL}/api/demandas/pagina?${params}`, { headers: authHeaders(token) });
  return parseOrThrow<DemandaPaginaResponse>(res);
}

export async function criarDemanda(token: string, request: DemandaCreateRequest): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Aprova e já envia a demanda para uma coluna do Kanban do condomínio - só enquanto pendente. */
export async function aprovarDemanda(
  token: string,
  id: number,
  request: DemandaAprovarRequest,
): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/aprovar`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Reprova com justificativa, sem passar pelo Kanban - só enquanto pendente. */
export async function reprovarDemanda(
  token: string,
  id: number,
  request: DemandaReprovarRequest,
): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/reprovar`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Move o card de uma demanda já aprovada pra outra coluna do Kanban (arrastar no quadro). */
export async function moverDemandaKanban(
  token: string,
  id: number,
  request: DemandaMoverKanbanRequest,
): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/mover-kanban`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Único jeito de funcionário "editar" uma demanda depois de criada - só marca/desmarca
 * sigilosa (alterna). Funciona em qualquer status. */
export async function alternarSigiloDemanda(token: string, id: number): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/alternar-sigilo`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Arquiva uma demanda que está numa coluna finalística do Kanban (botão no card) - só
 * funcionário. Não apaga nada, só marca `arquivada = true`. */
export async function arquivarDemanda(token: string, id: number): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/arquivar`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Item 4.8 - quem além do padrão (síndico/sub-síndico/solicitante/quem marcou) enxerga
 * uma demanda sigilosa. Só quem já gerencia o sigilo dela (`podeGerenciarSigilo`) chama
 * essas três - o backend confere de novo, mas a tela já esconde a opção pra quem não pode. */
export type DemandaAcessoSigilosoResponse = {
  id: number;
  demandaId: number;
  tipoPessoa: "morador" | "funcionario";
  nome: string;
  cpf: string;
};

export async function listarAcessoSigiloso(token: string, demandaId: number): Promise<DemandaAcessoSigilosoResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/acesso-sigiloso`, { headers: authHeaders(token) });
  return parseOrThrow<DemandaAcessoSigilosoResponse[]>(res);
}

/** Item 4.8 (pedido do Romulo: "exibir os que veem por padrão, mediante regra, como
 * síndicos e subsíndicos") - quem já vê a demanda sigilosa POR REGRA, não por concessão
 * explícita (por isso não tem `id`/botão de revogar, diferente de
 * `DemandaAcessoSigilosoResponse`) - hoje só síndico/sub-síndico ativos do condomínio. */
export type VisualizadorPorRegraResponse = {
  nome: string;
  perfil: FuncionarioPerfil;
};

export async function listarVisualizacaoPorRegra(
  token: string,
  demandaId: number,
): Promise<VisualizadorPorRegraResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/acesso-sigiloso/por-regra`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<VisualizadorPorRegraResponse[]>(res);
}

/** Toda pessoa (morador ou funcionário) ativa no condomínio da demanda - alimenta a combo
 * de busca do "Gerenciar acesso" (`ComboPessoa`), pra escolher por nome/unidade/CPF em
 * vez de decorar o CPF. `unidade` só vem preenchida pra morador. */
export type CandidatoAcessoResponse = {
  cpf: string;
  nome: string;
  tipoPessoa: "morador" | "funcionario";
  unidade: string | null;
  perfil: FuncionarioPerfil | null;
  funcao: string | null;
};

export async function listarCandidatosAcesso(token: string, demandaId: number): Promise<CandidatoAcessoResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/acesso-sigiloso/candidatos`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<CandidatoAcessoResponse[]>(res);
}

/** Concede pelo CPF - o backend concede em todos os papéis (morador e/ou funcionário)
 * que a pessoa tiver vínculo ativo com o condomínio da demanda. */
export async function concederAcessoSigiloso(
  token: string,
  demandaId: number,
  cpf: string,
): Promise<DemandaAcessoSigilosoResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/acesso-sigiloso`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ cpf }),
  });
  return parseOrThrow<DemandaAcessoSigilosoResponse[]>(res);
}

export async function revogarAcessoSigiloso(token: string, demandaId: number, acessoId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/acesso-sigiloso/${acessoId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

/** Funcionários atribuídos como responsáveis por uma demanda - pode ter mais de um.
 * Mesmo espírito do "Gerenciar acesso" sigiloso (acima), só que sem restrição de perfil:
 * qualquer funcionário do condomínio pode atribuir/remover. */
/** `perfil`/`funcao` vêm do vínculo do funcionário com o condomínio da demanda (pedido
 * do Romulo: mostrar ao lado do nome - cargo pra quem tem login, função pra quem não tem). */
export type DemandaResponsavelResponse = {
  id: number;
  demandaId: number;
  funcionarioId: number;
  nome: string;
  cpf: string;
  perfil: FuncionarioPerfil | null;
  funcao: string | null;
};

export async function listarResponsaveis(token: string, demandaId: number): Promise<DemandaResponsavelResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/responsaveis`, { headers: authHeaders(token) });
  return parseOrThrow<DemandaResponsavelResponse[]>(res);
}

/** Funcionários ativos do condomínio da demanda - alimenta a combo de busca de "Atribuir
 * responsável" (`ComboPessoa`), pra escolher por nome/CPF em vez de decorar o CPF. */
export type CandidatoResponsavelResponse = {
  cpf: string;
  nome: string;
  perfil: FuncionarioPerfil | null;
  funcao: string | null;
};

export async function listarCandidatosResponsavel(
  token: string,
  demandaId: number,
): Promise<CandidatoResponsavelResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/responsaveis/candidatos`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<CandidatoResponsavelResponse[]>(res);
}

export async function atribuirResponsavel(
  token: string,
  demandaId: number,
  cpf: string,
): Promise<DemandaResponsavelResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/responsaveis`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ cpf }),
  });
  return parseOrThrow<DemandaResponsavelResponse>(res);
}

export async function removerResponsavel(token: string, demandaId: number, atribuicaoId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/demandas/${demandaId}/responsaveis/${atribuicaoId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

export type DemandaEtapaResponse = {
  id: number;
  demandaId: number;
  nome: string;
  /** Só data (ex: "2026-09-03"), sem hora - null quando a etapa não tem prazo marcado. */
  prazo: string | null;
  concluida: boolean;
  concluidaEm: string | null;
  ordem: number;
};

export type DemandaEtapaCreateRequest = {
  demandaId: number;
  nome: string;
  prazo?: string | null;
  ordem?: number | null;
};

export type DemandaEtapaUpdateRequest = {
  nome: string;
  prazo?: string | null;
  ordem?: number | null;
};

/** Checklist interno da demanda - só funcionário do condomínio da demanda vê/mexe. */
export async function listarEtapas(token: string, demandaId: number): Promise<DemandaEtapaResponse[]> {
  const res = await fetch(`${API_URL}/api/demanda-etapas?demandaId=${demandaId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaEtapaResponse[]>(res);
}

export async function criarEtapa(
  token: string,
  request: DemandaEtapaCreateRequest,
): Promise<DemandaEtapaResponse> {
  const res = await fetch(`${API_URL}/api/demanda-etapas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaEtapaResponse>(res);
}

export async function atualizarEtapa(
  token: string,
  id: number,
  request: DemandaEtapaUpdateRequest,
): Promise<DemandaEtapaResponse> {
  const res = await fetch(`${API_URL}/api/demanda-etapas/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaEtapaResponse>(res);
}

/** Alterna concluída/não concluída (como um checkbox). */
export async function alternarConcluidaEtapa(token: string, id: number): Promise<DemandaEtapaResponse> {
  const res = await fetch(`${API_URL}/api/demanda-etapas/${id}/concluir`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaEtapaResponse>(res);
}

/** Uma linha do histórico de transição de coluna do Kanban - usado pelo ícone de relógio
 * do card (tooltip "há quantos dias nesta coluna" + modal com o histórico completo). Em
 * ordem cronológica (mais antiga primeiro) - a última da lista é a transição mais
 * recente. `statusAnteriorNome` é null na primeira transição (entrada no Kanban via
 * aprovação, sem coluna anterior). */
export type DemandaStatusKanbanHistoricoResponse = {
  id: number;
  demandaId: number;
  statusAnteriorId: number | null;
  statusAnteriorNome: string | null;
  statusNovoId: number;
  statusNovoNome: string;
  funcionarioNome: string;
  createdAt: string;
};

export async function listarHistoricoKanban(
  token: string,
  demandaId: number,
): Promise<DemandaStatusKanbanHistoricoResponse[]> {
  const res = await fetch(`${API_URL}/api/demanda-status-kanban-historico?demandaId=${demandaId}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaStatusKanbanHistoricoResponse[]>(res);
}

/** Anexo de imagem numa demanda (item 4.9) - `url` vem assinada, expira em 15min (pedir
 * de novo com `listarDocumentosDemanda` se precisar depois disso). */
export type DemandaDocumentoResponse = {
  id: number;
  demandaId: number;
  nomeArquivo: string;
  url: string;
  tipoMime: string;
  tamanhoBytes: number;
  enviadoPorNome: string | null;
  createdAt: string;
};

export async function listarDocumentosDemanda(token: string, demandaId: number): Promise<DemandaDocumentoResponse[]> {
  const res = await fetch(`${API_URL}/api/demanda-documentos?demandaId=${demandaId}`, { headers: authHeaders(token) });
  return parseOrThrow<DemandaDocumentoResponse[]>(res);
}

/** Só imagem (jpeg/png/webp/gif), máx. 8MB - o backend confere de novo, isso aqui é só
 * pra dar erro cedo sem gastar uma chamada. `fetch` com `FormData` NÃO deve setar
 * `Content-Type` na mão - o navegador gera o `multipart/form-data; boundary=...` sozinho. */
export async function uploadDocumentoDemanda(
  token: string,
  demandaId: number,
  arquivo: File,
): Promise<DemandaDocumentoResponse> {
  const corpo = new FormData();
  corpo.append("demandaId", String(demandaId));
  corpo.append("arquivo", arquivo);
  const res = await fetch(`${API_URL}/api/demanda-documentos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: corpo,
  });
  return parseOrThrow<DemandaDocumentoResponse>(res);
}

export async function removerDocumentoDemanda(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/demanda-documentos/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

/** Nota numa demanda (pedido do Romulo): morador pergunta sobre o andamento, funcionário
 * responde com outra nota se julgar necessário. `notaPaiId` nulo = pergunta nova (raiz);
 * preenchido = resposta a outra nota - usado pra indentar no frontend. `lida`/`lidaEm` só
 * é setado por funcionário (manual ou automático, ao responder). `podeResponder` já vem
 * calculado pelo backend por quem está vendo (pedido do Romulo: quem abriu a nota não pode
 * responder a ela mesma; também fica falso se a demanda estiver arquivada). */
export type DemandaNotaResponse = {
  id: number;
  demandaId: number;
  notaPaiId: number | null;
  autorTipo: "morador" | "funcionario";
  autorNome: string;
  texto: string;
  lida: boolean;
  lidaEm: string | null;
  podeResponder: boolean;
  createdAt: string;
};

export type DemandaNotaCreateRequest = {
  demandaId: number;
  notaPaiId?: number | null;
  texto: string;
};

/** Já vem ordenada mais antiga primeiro - o chamador monta a árvore raiz/resposta a partir
 * de `notaPaiId`. */
export async function listarNotasDemanda(token: string, demandaId: number): Promise<DemandaNotaResponse[]> {
  const res = await fetch(`${API_URL}/api/demanda-notas?demandaId=${demandaId}`, { headers: authHeaders(token) });
  return parseOrThrow<DemandaNotaResponse[]>(res);
}

export async function criarNotaDemanda(
  token: string,
  request: DemandaNotaCreateRequest,
): Promise<DemandaNotaResponse> {
  const res = await fetch(`${API_URL}/api/demanda-notas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<DemandaNotaResponse>(res);
}

/** Só funcionário - idempotente, marcar de novo não muda nada. */
export async function marcarNotaLida(token: string, id: number): Promise<DemandaNotaResponse> {
  const res = await fetch(`${API_URL}/api/demanda-notas/${id}/marcar-lida`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaNotaResponse>(res);
}

/** `tipo`: "aprovada"/"reprovada" (colunas nulas, `justificativa` preenchida) ou "kanban"
 * (colunas preenchidas, `justificativa` nula) - ver `AlertaMudancasStatus`. `origem`:
 * "propria" (demanda que o morador abriu) ou "acompanhada" (demanda de outra pessoa que
 * ele marcou "Acompanhar" - pedido do Romulo). */
export type DemandaMudancaStatusResponse = {
  demandaId: number;
  demandaTitulo: string;
  tipo: "aprovada" | "reprovada" | "kanban";
  colunaAnteriorNome: string | null;
  colunaNovaNome: string | null;
  justificativa: string | null;
  data: string;
  origem: "propria" | "acompanhada";
};

/** Alerta de login do morador (pedido do Romulo) - `desde` é o `ultimoLoginAnterior` que
 * veio no login (ISO, sem timezone - o backend usa `LocalDateTime`). Só morador. */
export async function listarMudancasStatus(
  token: string,
  desde: string,
): Promise<DemandaMudancaStatusResponse[]> {
  const res = await fetch(`${API_URL}/api/demandas/mudancas-status?desde=${encodeURIComponent(desde)}`, {
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaMudancaStatusResponse[]>(res);
}

/** Funcionalidade "Acompanhar" (pedido do Romulo): morador marca acompanhar uma demanda
 * que ele não abriu, pra ela entrar no alerta de mudança de status junto das próprias.
 * Idempotente - marcar de novo não duplica. */
export async function acompanharDemanda(token: string, id: number): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/acompanhar`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Desmarca "Acompanhar" - idempotente. */
export async function deixarDeAcompanharDemanda(token: string, id: number): Promise<DemandaResponse> {
  const res = await fetch(`${API_URL}/api/demandas/${id}/acompanhar`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return parseOrThrow<DemandaResponse>(res);
}

/** Parâmetro geral do sistema (pedido do Romulo) - valor de regra de negócio (ex: máximo
 * de fotos por demanda) editável só pelo administrador, sem precisar de deploy. `nome` é
 * a chave que o backend usa pra ler o valor (`ParametroService.getInt`) - não é editável
 * depois de criado, ver `ParametroUpdateRequest`. */
export type ParametroResponse = {
  id: number;
  nome: string;
  descricao: string | null;
  valor: string;
  createdAt: string;
  updatedAt: string;
};

export type ParametroCreateRequest = {
  nome: string;
  descricao: string | null;
  valor: string;
};

export type ParametroUpdateRequest = {
  descricao: string | null;
  valor: string;
};

/** Só administrador - 403 pra qualquer outro papel. */
export async function listarParametros(token: string): Promise<ParametroResponse[]> {
  const res = await fetch(`${API_URL}/api/parametros`, { headers: authHeaders(token) });
  return parseOrThrow<ParametroResponse[]>(res);
}

export async function criarParametro(token: string, request: ParametroCreateRequest): Promise<ParametroResponse> {
  const res = await fetch(`${API_URL}/api/parametros`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<ParametroResponse>(res);
}

export async function atualizarParametro(
  token: string,
  id: number,
  request: ParametroUpdateRequest,
): Promise<ParametroResponse> {
  const res = await fetch(`${API_URL}/api/parametros/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return parseOrThrow<ParametroResponse>(res);
}

export async function excluirParametro(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/parametros/${id}`, { method: "DELETE", headers: authHeaders(token) });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}

/** Mensagem privada (pedido do Romulo): conversa livre entre morador OU funcionário
 * (autor) e um ou mais funcionários com login do mesmo condomínio (destinatários) -
 * privacidade estrita, só quem participa vê. */
export type MensagemPrivadaDocumentoResponse = {
  id: number;
  mensagemId: number;
  nomeArquivo: string;
  url: string;
  tipoMime: string;
  tamanhoBytes: number;
  createdAt: string;
};

/** `minha` já vem calculado pelo backend por quem está vendo (mesmo padrão de
 * `DemandaNotaResponse.podeResponder`) - usar isso pra alinhar o balão, nunca comparar
 * nome (dois funcionários podem ter o mesmo nome). */
export type MensagemPrivadaResponse = {
  id: number;
  conversaId: number;
  autorTipo: "morador" | "funcionario";
  autorNome: string;
  texto: string;
  minha: boolean;
  anexos: MensagemPrivadaDocumentoResponse[];
  createdAt: string;
};

export type ConversaPrivadaDestinatarioResponse = {
  funcionarioId: number;
  nome: string;
};

/** `pendente` é calculado pelo backend por quem está vendo (destaque vermelho no menu -
 * ver `existePendenciaMensagemPrivada`). `autorBlocoNome`/`autorNumeroUnidade` só vêm
 * preenchidos quando `autorTipo` é `"morador"` (pedido do Romulo: mostrar a unidade do
 * morador na listagem) - `autorBlocoNome` fica `null` em condomínio de casas. */
export type ConversaPrivadaResumoResponse = {
  id: number;
  autorTipo: "morador" | "funcionario";
  autorNome: string;
  autorBlocoNome: string | null;
  autorNumeroUnidade: string | null;
  destinatarios: ConversaPrivadaDestinatarioResponse[];
  ultimaMensagemTexto: string | null;
  ultimaMensagemAutorNome: string | null;
  ultimaMensagemEm: string;
  pendente: boolean;
  createdAt: string;
};

export type ConversaPrivadaDetalheResponse = {
  id: number;
  autorTipo: "morador" | "funcionario";
  autorNome: string;
  destinatarios: ConversaPrivadaDestinatarioResponse[];
  mensagens: MensagemPrivadaResponse[];
  createdAt: string;
};

/** Funcionário COM LOGIN (perfil preenchido) do condomínio - alimenta a combo de busca de
 * destinatário POR NOME (pedido do Romulo: "vai ser difícil saber o cpf do funcionário").
 * `cpf` continua vindo (é o identificador mandado de volta em `criarConversaPrivada`), só
 * não é mais exibido - `perfil` entra no lugar do CPF na sugestão. */
export type CandidatoDestinatarioResponse = {
  cpf: string;
  nome: string;
  perfil: FuncionarioPerfil;
};

export async function listarCandidatosMensagemPrivada(token: string): Promise<CandidatoDestinatarioResponse[]> {
  const res = await fetch(`${API_URL}/api/conversas-privadas/candidatos`, { headers: authHeaders(token) });
  return parseOrThrow<CandidatoDestinatarioResponse[]>(res);
}

/** Mais recente primeiro - autor OU destinatário, conforme o papel de quem está logado.
 * Paginado (pedido do Romulo: "mesma quantidade da listagem de demandas" - 20 por página,
 * mesmo padrão de `listarPaginaDemandas`). */
export async function listarConversasPrivadas(
  token: string,
  pagina = 0,
): Promise<PaginaResponse<ConversaPrivadaResumoResponse>> {
  const res = await fetch(`${API_URL}/api/conversas-privadas?pagina=${pagina}`, { headers: authHeaders(token) });
  return parseOrThrow<PaginaResponse<ConversaPrivadaResumoResponse>>(res);
}

/** Boolean leve pro destaque vermelho no ícone do menu - evita carregar a listagem inteira
 * só pra saber se tem alguma pendência (polling periódico, ver `MenuMensagensPrivadas`). */
export async function existePendenciaMensagemPrivada(token: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/conversas-privadas/pendente`, { headers: authHeaders(token) });
  return parseOrThrow<boolean>(res);
}

/** Abre o chat completo - o backend marca como vista por quem está abrindo na mesma
 * tacada (some o destaque vermelho). */
export async function buscarConversaPrivada(token: string, id: number): Promise<ConversaPrivadaDetalheResponse> {
  const res = await fetch(`${API_URL}/api/conversas-privadas/${id}`, { headers: authHeaders(token) });
  return parseOrThrow<ConversaPrivadaDetalheResponse>(res);
}

export async function criarConversaPrivada(
  token: string,
  destinatariosCpf: string[],
  texto: string,
): Promise<ConversaPrivadaDetalheResponse> {
  const res = await fetch(`${API_URL}/api/conversas-privadas`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ destinatariosCpf, texto }),
  });
  return parseOrThrow<ConversaPrivadaDetalheResponse>(res);
}

/** "Conversa livre" (pedido do Romulo) - qualquer participante pode escrever, não só
 * responder uma vez. */
export async function enviarMensagemPrivada(
  token: string,
  conversaId: number,
  texto: string,
): Promise<MensagemPrivadaResponse> {
  const res = await fetch(`${API_URL}/api/conversas-privadas/mensagens`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ conversaId, texto }),
  });
  return parseOrThrow<MensagemPrivadaResponse>(res);
}

/** Só imagem (jpeg/png/webp/gif) - máximo por mensagem é parametrizável (padrão 1). Só o
 * autor da mensagem pode anexar. */
export async function uploadFotoMensagemPrivada(
  token: string,
  mensagemId: number,
  arquivo: File,
): Promise<MensagemPrivadaDocumentoResponse> {
  const corpo = new FormData();
  corpo.append("mensagemId", String(mensagemId));
  corpo.append("arquivo", arquivo);
  const res = await fetch(`${API_URL}/api/mensagem-privada-documentos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: corpo,
  });
  return parseOrThrow<MensagemPrivadaDocumentoResponse>(res);
}

export async function removerFotoMensagemPrivada(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/mensagem-privada-documentos/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) {
    await parseOrThrow(res);
  }
}
