"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { assinarSessao, getSessaoServerSnapshot, getSessaoSnapshot, Sessao } from "./session";

// Nunca notifica de propósito (o fato de já estar montado no navegador não "muda" depois
// que já é verdade) - só serve pra pegar carona no mesmo mecanismo de correção pós-
// hidratação do `useSyncExternalStore`, sem precisar de um `setState` manual num efeito
// (isso é o que corrigiu um bug real: reload direto de `/condominios` com sessão válida
// jogava de volta pro login, porque o efeito de redirect rodava com `sessao` ainda no
// valor do servidor - `false`/`null` - antes da correção da store terminar).
function assinarNunca() {
  return () => {};
}

/** Garante que a página só é usada com sessão ativa - redireciona pro login senão. */
export function useSessaoObrigatoria(): Sessao | null {
  const router = useRouter();
  const sessao = useSyncExternalStore(assinarSessao, getSessaoSnapshot, getSessaoServerSnapshot);
  const montado = useSyncExternalStore(assinarNunca, () => true, () => false);

  useEffect(() => {
    if (montado && sessao === null) router.replace("/login");
  }, [montado, sessao, router]);

  return montado ? sessao : null;
}
