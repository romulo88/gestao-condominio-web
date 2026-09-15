"use client";

import Link from "next/link";
import { IconeRelogio } from "@/components/icons";

/** Ícone de "etapa em atraso" no menu do topo (só funcionário, pedido do Romulo, mesmo
 * espírito de `MenuNotasPendentes` ao lado) - vermelho ou cinza (sem o verde do contorno
 * do card do Kanban, pedido do Romulo pra este ícone específico). Componente burro de
 * propósito - `existeEtapaVencida` vem calculado por quem chama (`MenuIconesAlerta`, ver
 * lá o porquê). Clicar leva pra `/demandas?etapaVencida=1`, que já abre com o filtro aplicado. */
export function MenuEtapaVencida({ existeEtapaVencida }: { existeEtapaVencida: boolean }) {
  return (
    <Link
      href="/demandas?etapaVencida=1"
      title={
        existeEtapaVencida
          ? "Tem demanda com etapa em atraso - clique pra filtrar"
          : "Etapas em atraso"
      }
      className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-800 ${
        existeEtapaVencida ? "text-red-400 hover:text-red-300" : "text-slate-200 hover:text-white"
      }`}
    >
      <IconeRelogio className="h-5 w-5" />
    </Link>
  );
}
