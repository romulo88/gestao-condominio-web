import type { FuncionarioPerfil, TermosPendenteResponse, TipoPapel } from "./api";

/** O que a tela precisa saber sobre quem está logado, sem decodificar o JWT toda hora. */
export type Sessao = {
  /** Token emitido no login (ou na troca de perfil) - fica ESTÁVEL durante a sessão, de
   * propósito: várias telas usam isso como dependência de efeito e como chave de "alerta já
   * mostrado". NÃO é o token que vai pro servidor depois dos primeiros minutos: o token vale
   * 15 minutos de inatividade e é renovado em segredo (ver `tokenAtual`/`guardarTokenRenovado`
   * e `use-renovacao-sessao.ts`). Toda chamada de API resolve o token certo sozinha
   * (`bearer` em `api.ts`), então as telas continuam passando `sessao.token` como sempre. */
  token: string;
  nome: string;
  tipoPapel: TipoPapel;
  perfil: FuncionarioPerfil | null;
  condominioId: number | null;
  condominioNome: string | null;
  /** `ultimoLoginAnterior` que veio no login (null na primeira vez que a pessoa loga) -
   * usado pelo `AlertaMudancasStatus` (só morador) como "desde quando" mostrar as
   * mudanças. Trocar de perfil (`AppShell.handleTrocarContexto`) carrega esse valor pra
   * frente sem mudar - não é um login novo, é a mesma sessão com outro chapéu. */
  ultimoLoginAnterior: string | null;
  /** Não nulo enquanto a pessoa não aceitar a versão vigente do termo de responsabilidade -
   * `AppShell` mostra um modal bloqueante até isso ficar `null` (ver `aceitarTermos`).
   * Calculado só no login de verdade (nunca reavaliado em tempo real durante a sessão) -
   * trocar de perfil carrega o valor de sempre, igual `ultimoLoginAnterior`. */
  termosPendente: TermosPendenteResponse | null;
};

// A sessão mora em `sessionStorage` (pedido do Romulo: computador compartilhado no escritório
// e na portaria) - fechar o navegador/aba encerra a sessão, em vez de deixar a tela de quem
// saiu sem clicar em "Sair" esperando o próximo usuário. Consequência aceita: abrir o sistema
// numa aba nova pede login de novo. A chave tem prefixo próprio porque o storage é por
// ORIGEM, não por caminho: outros sistemas no mesmo domínio enxergam as mesmas chaves.
const CHAVE = "commander:sessao";
// Token que vai de fato pro servidor (renovado em segredo enquanto a pessoa usa a tela) +
// quando, NO RELÓGIO DESTE NAVEGADOR, foi obtido. Medir o prazo por relógio local (e não pelo
// `exp` do JWT) evita derrubar todo mundo num computador com a hora errada.
const CHAVE_TOKEN = "commander:token";

/** Quanto o servidor aceita o token sem renovação - espelha `jwt.expiracao-completo-ms` do
 * `application.yml` (15 minutos de INATIVIDADE). */
export const VALIDADE_TOKEN_MS = 15 * 60_000;

type TokenGuardado = { token: string; obtidoEm: number };

function lerTokenGuardado(): TokenGuardado | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_TOKEN);
    return bruto ? (JSON.parse(bruto) as TokenGuardado) : null;
  } catch {
    return null;
  }
}

function gravarTokenGuardado(token: string) {
  try {
    sessionStorage.setItem(CHAVE_TOKEN, JSON.stringify({ token, obtidoEm: Date.now() } satisfies TokenGuardado));
  } catch {
    /* sem persistência - a próxima chamada usa `sessao.token`, que é o do login */
  }
}

/** Token pra mandar ao servidor agora: o último renovado, ou `padrao` (o do login) se ainda
 * não houve renovação. */
export function tokenAtual(padrao: string): string {
  return lerTokenGuardado()?.token ?? padrao;
}

/** Guarda o token renovado SEM mexer em `Sessao` (e sem notificar ninguém) - a identidade da
 * sessão fica igual, só o que vai pro servidor muda. */
export function guardarTokenRenovado(token: string) {
  gravarTokenGuardado(token);
}

/** Há quanto tempo (relógio local) o token atual foi obtido - null sem sessão. */
export function idadeDoTokenAtualMs(): number | null {
  const guardado = lerTokenGuardado();
  return guardado ? Date.now() - guardado.obtidoEm : null;
}

// Cache simples pra `getSessaoSnapshot` devolver a MESMA referência enquanto o valor
// bruto não mudar - `useSyncExternalStore` exige isso (senão re-renderiza pra sempre,
// achando que o snapshot "mudou" a cada chamada só por ser um objeto novo).
let ultimoBruto: string | null | undefined;
let ultimoParseado: Sessao | null = null;

let legadoLimpo = false;

/** Antes desta mudança a sessão ficava em `localStorage`, que sobrevive ao fechamento do
 * navegador - apaga o que sobrou lá (uma vez por carregamento da página), senão a sessão de
 * alguém que nunca clicou em "Sair" continuaria esperando o próximo usuário daquele
 * computador. */
function limparSessaoLegada() {
  if (legadoLimpo) return;
  legadoLimpo = true;
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* sem acesso ao localStorage - nada a limpar */
  }
}

// Roda assim que o módulo carrega no navegador (login inclusive - a tela de login não lê a
// sessão, então não bastaria limpar só dentro de `lerDoStorage`).
if (typeof window !== "undefined") limparSessaoLegada();

function lerDoStorage(): Sessao | null {
  limparSessaoLegada();
  let bruto: string | null;
  try {
    bruto = sessionStorage.getItem(CHAVE);
  } catch {
    bruto = null;
  }
  if (bruto === ultimoBruto) return ultimoParseado;
  ultimoBruto = bruto;
  try {
    ultimoParseado = bruto ? (JSON.parse(bruto) as Sessao) : null;
  } catch {
    ultimoParseado = null;
  }
  return ultimoParseado;
}

const listeners = new Set<() => void>();
function notificar() {
  for (const l of listeners) l();
}

/** Assina mudanças de sessão. `sessionStorage` é por aba e não dispara o evento `storage`
 * entre abas (diferente do `localStorage` de antes), então só `salvarSessao`/`limparSessao`
 * - que chamam `notificar()` manualmente - mexem na sessão desta aba. Usado por
 * `useSessaoObrigatoria` via `useSyncExternalStore`. */
export function assinarSessao(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessaoSnapshot(): Sessao | null {
  return lerDoStorage();
}

/** No servidor não existe `sessionStorage` - sempre "sem sessão" até hidratar no navegador. */
export function getSessaoServerSnapshot(): Sessao | null {
  return null;
}

export function salvarSessao(sessao: Sessao) {
  // Token diferente do já guardado = login novo ou troca de perfil: o token de verdade
  // recomeça dele. Mesmo token (ex.: aceitar o termo, que só reescreve a sessão) NÃO pode
  // sobrescrever o token renovado com o do login - esse já pode estar vencido.
  const anterior = getSessaoSnapshot();
  if (!anterior || anterior.token !== sessao.token) {
    gravarTokenGuardado(sessao.token);
  }
  sessionStorage.setItem(CHAVE, JSON.stringify(sessao));
  notificar();
}

export function limparSessao() {
  sessionStorage.removeItem(CHAVE);
  sessionStorage.removeItem(CHAVE_TOKEN);
  notificar();
}

/** Pra onde mandar depois do login (ou ao abrir a raiz já logado): funcionário e morador
 * caem direto no quadro de avisos do condomínio deles - administrador não tem condomínio
 * próprio, então cai na lista de condomínios (é lá que ele gerencia tudo). Exceções, cada
 * perfil de "operador de campo" cai direto na própria tela: `rondista` → `/ronda` (feature
 * "Controle de Rondas"), `porteiro` → `/portaria` (feature "Eventos") - `agente_convivio`
 * (o outro perfil de acesso restrito) continua indo pra avisos normalmente. */
export function destinoPosLogin(tipoPapel: TipoPapel, perfil: FuncionarioPerfil | null): string {
  if (tipoPapel === "administrador") return "/condominios";
  if (tipoPapel === "funcionario" && perfil === "rondista") return "/ronda";
  if (tipoPapel === "funcionario" && perfil === "porteiro") return "/portaria";
  return "/avisos";
}
