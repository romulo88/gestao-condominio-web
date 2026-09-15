"use client";

import Link from "next/link";
import { IconeNotaPendente } from "@/components/icons";

/** Ícone de "nota pendente" no menu do topo (só funcionário, pedido do Romulo: "quando o
 * funcionário logar já verá que tem notas para responder caso ele esteja na cor laranja").
 * Mesmo ícone/cor do filtro em `/demandas` (`IconeNotaPendente` + laranja quando existe
 * alguma demanda com nota não lida ou sem resposta). Componente burro de propósito -
 * `existeNotaPendente` vem calculado por quem chama (`MenuIconesAlerta`, ver lá o porquê:
 * evita duas buscas iguais à API quando este ícone e o de etapa vencida estão os dois no
 * ar, e centraliza a lógica de atualização periódica num lugar só). Clicar leva pra
 * `/demandas?notaNaoLida=1`, que já abre com o filtro aplicado. */
export function MenuNotasPendentes({ existeNotaPendente }: { existeNotaPendente: boolean }) {
  return (
    <Link
      href="/demandas?notaNaoLida=1"
      title={
        existeNotaPendente
          ? "Tem demanda com nota não lida - clique pra filtrar"
          : "Notas pendentes em demandas"
      }
      className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-800 ${
        existeNotaPendente ? "text-orange-400 hover:text-orange-300" : "text-slate-200 hover:text-white"
      }`}
    >
      <IconeNotaPendente className="h-5 w-5" />
    </Link>
  );
}
