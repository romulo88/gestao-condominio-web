// Máscaras visuais compartilhadas - o que vai pro backend é sempre `apenasDigitos(...)`,
// nunca o valor mascarado (CPF/CNPJ são guardados/comparados sem pontuação).

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function formatarCpf(valor: string): string {
  return apenasDigitos(valor)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatarCnpj(valor: string): string {
  return apenasDigitos(valor)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Etapa (`DemandaEtapaResponse`) com prazo vencido: tem prazo marcado, o prazo já passou
 * (antes de hoje) e ainda não foi concluída - mesmo critério do backend
 * (`DemandaService.calcularFlagsEtapas`), pedido do Romulo pra destacar em vermelho o
 * texto do prazo e o contorno do card no Kanban. Recebe só os dois campos que importam,
 * não o tipo inteiro da API, pra não acoplar este arquivo de máscaras a `lib/api.ts`.
 * Comparação por string (ambas "YYYY-MM-DD") em vez de `Date`, pra não depender de fuso
 * horário. */
export function etapaVencida(etapa: { prazo: string | null; concluida: boolean }): boolean {
  if (etapa.concluida || !etapa.prazo) return false;
  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return etapa.prazo < hojeIso;
}

/** Etapa com prazo vigente: tem prazo marcado, ainda não vencido (hoje ou depois) e ainda
 * não foi concluída - pedido do Romulo pra destacar em verde o texto do prazo e o contorno
 * do card no Kanban. Se a mesma demanda tiver etapa vencida E vigente, quem usa este
 * helper deve dar prioridade ao vermelho de `etapaVencida` (pedido do Romulo). */
export function etapaVigente(etapa: { prazo: string | null; concluida: boolean }): boolean {
  return !etapa.concluida && etapa.prazo !== null && !etapaVencida(etapa);
}

/** Existe alguma nota RAIZ (pergunta de verdade, não uma resposta) ainda não lida - mesmo
 * critério do backend (`DemandaService.algumaPendente`). "Lida" e "respondida" são a MESMA
 * coisa pro sistema (pedido do Romulo: "uma nota lida ou respondida é uma nota lida") -
 * responder já marca a nota-pai como lida na mesma tacada, então checar só `lida` já cobre
 * os dois jeitos de resolver. Usado pra recalcular `temNotaPendente` no cliente, sem
 * round-trip à API, depois de cadastrar/responder/marcar uma nota no card do Kanban
 * (pedido do Romulo: o card/menu não atualizava sozinho até um recarregamento completo).
 * Recebe só os dois campos que importam, não o tipo inteiro da API, pra não acoplar este
 * arquivo a `lib/api.ts`. */
export function existeNotaPendente(notas: { notaPaiId: number | null; lida: boolean }[]): boolean {
  return notas.filter((n) => n.notaPaiId === null).some((n) => !n.lida);
}
