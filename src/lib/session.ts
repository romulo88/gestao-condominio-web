import { FuncionarioPerfil, TipoPapel } from "./api";

/** O que a tela precisa saber sobre quem está logado, sem decodificar o JWT toda hora. */
export type Sessao = {
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
};

// localStorage é por ORIGEM, não por caminho: outros sistemas no mesmo domínio (cada um no
// seu prefixo) enxergam as mesmas chaves - por isso a chave tem prefixo próprio.
const CHAVE = "commander:sessao";

// Cache simples pra `getSessaoSnapshot` devolver a MESMA referência enquanto o valor
// bruto não mudar - `useSyncExternalStore` exige isso (senão re-renderiza pra sempre,
// achando que o snapshot "mudou" a cada chamada só por ser um objeto novo).
let ultimoBruto: string | null | undefined;
let ultimoParseado: Sessao | null = null;

function lerDoStorage(): Sessao | null {
  let bruto: string | null;
  try {
    bruto = localStorage.getItem(CHAVE);
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

/** Assina mudanças de sessão - inclui outras abas (evento `storage`) e a própria aba
 * (que não dispara `storage` sozinha, por isso `salvarSessao`/`limparSessao` chamam
 * `notificar()` manualmente). Usado por `useSessaoObrigatoria` via `useSyncExternalStore`. */
export function assinarSessao(listener: () => void): () => void {
  listeners.add(listener);
  const aoMudarStorage = (e: StorageEvent) => {
    if (e.key === CHAVE || e.key === null) listener();
  };
  window.addEventListener("storage", aoMudarStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", aoMudarStorage);
  };
}

export function getSessaoSnapshot(): Sessao | null {
  return lerDoStorage();
}

/** No servidor não existe `localStorage` - sempre "sem sessão" até hidratar no navegador. */
export function getSessaoServerSnapshot(): Sessao | null {
  return null;
}

export function salvarSessao(sessao: Sessao) {
  localStorage.setItem(CHAVE, JSON.stringify(sessao));
  notificar();
}

export function limparSessao() {
  localStorage.removeItem(CHAVE);
  notificar();
}

/** Pra onde mandar depois do login (ou ao abrir a raiz já logado): funcionário e morador
 * caem direto no quadro de avisos do condomínio deles - administrador não tem condomínio
 * próprio, então cai na lista de condomínios (é lá que ele gerencia tudo). */
export function destinoPosLogin(tipoPapel: TipoPapel): string {
  return tipoPapel === "administrador" ? "/condominios" : "/avisos";
}
