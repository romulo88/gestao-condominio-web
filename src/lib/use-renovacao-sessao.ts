"use client";

import { useEffect, useRef } from "react";
import { renovarSessao } from "./api";
import { getSessaoSnapshot, guardarTokenRenovado, idadeDoTokenAtualMs, limparSessao, tokenAtual, VALIDADE_TOKEN_MS } from "./session";

/** Sessão de 15 minutos de INATIVIDADE (pedido do Romulo: computador compartilhado no
 * escritório e na portaria). O token do servidor vale 15 minutos; enquanto a pessoa USA a
 * tela, este hook renova ele. Renovar só conta atividade real (clique, tecla, toque, mouse,
 * rolagem) - NÃO a simples existência de chamadas de API, porque o sistema faz chamadas
 * sozinho (alertas do menu, mensagens pendentes, envio de GPS da ronda): se qualquer chamada
 * renovasse, uma aba esquecida aberta nunca expiraria.
 *
 * Renova no máximo a cada `RENOVAR_APOS_MS` (não a cada clique) - o prazo efetivo de
 * inatividade fica entre 12 e 15 minutos. */
const RENOVAR_APOS_MS = 3 * 60_000;
const VERIFICAR_A_CADA_MS = 30_000;

let renovando = false;

/** Renova o token se ele já tem `RENOVAR_APOS_MS` de idade. Usado pela atividade do usuário
 * (hook abaixo) e pelo envio de pontos de GPS da ronda (rondista com a tela parada não gera
 * atividade, mas está trabalhando - pedido do Romulo). Falha silenciosa: se foi expiração,
 * `parseOrThrow` em `api.ts` já derrubou a sessão. */
export async function renovarSessaoSeVelha(): Promise<void> {
  const idade = idadeDoTokenAtualMs();
  if (idade === null || idade < RENOVAR_APOS_MS || renovando) return;
  renovando = true;
  try {
    const sessao = getSessaoSnapshot();
    if (!sessao) return;
    const { token } = await renovarSessao(tokenAtual(sessao.token));
    guardarTokenRenovado(token);
  } catch {
    /* ver comentário acima */
  } finally {
    renovando = false;
  }
}

const EVENTOS_DE_ATIVIDADE = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"] as const;

/** Montado uma vez no `AppShell` (que envolve toda tela autenticada). Derruba a sessão quando
 * o token passa de 15 minutos sem renovar, e renova enquanto houver atividade. */
export function useRenovacaoSessao(): void {
  const ultimaAtividade = useRef(0);

  useEffect(() => {
    // Abrir/navegar pra uma tela já conta como atividade (o AppShell remonta a cada navegação).
    ultimaAtividade.current = Date.now();
    const marcar = () => {
      ultimaAtividade.current = Date.now();
    };
    for (const evento of EVENTOS_DE_ATIVIDADE) {
      window.addEventListener(evento, marcar, { passive: true, capture: true });
    }

    function verificar() {
      const idade = idadeDoTokenAtualMs();
      if (idade === null) return;
      if (idade >= VALIDADE_TOKEN_MS) {
        limparSessao();
        return;
      }
      // Atividade DEPOIS de o token ter sido obtido (idade em ms ↔ há quanto tempo foi obtido).
      if (Date.now() - ultimaAtividade.current < idade) {
        void renovarSessaoSeVelha();
      }
    }

    verificar();
    const intervalo = setInterval(verificar, VERIFICAR_A_CADA_MS);
    // Celular/aba em segundo plano: timers ficam parados - confere assim que a tela volta.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      for (const evento of EVENTOS_DE_ATIVIDADE) {
        window.removeEventListener(evento, marcar, { capture: true });
      }
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);
}
