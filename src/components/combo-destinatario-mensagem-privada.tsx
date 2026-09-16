"use client";

import { useMemo, useState } from "react";
import { CandidatoDestinatarioResponse, PERFIL_LABEL } from "@/lib/api";
import { Input } from "@/components/ui";

type Props = {
  /** `null` enquanto ainda está carregando. */
  candidatos: CandidatoDestinatarioResponse[] | null;
  onSelecionar: (candidato: CandidatoDestinatarioResponse) => void;
  placeholder?: string;
};

function rotulo(c: CandidatoDestinatarioResponse): string {
  return `${c.nome} — ${PERFIL_LABEL[c.perfil]}`;
}

/** Combo de busca por NOME pra endereçar uma mensagem privada (pedido do Romulo: "vai ser
 * difícil saber o cpf do funcionário") - diferente do `ComboFuncionario` de "Atribuir
 * responsável" (que também busca por CPF e mostra o CPF na sugestão), aqui a sugestão
 * mostra o PERFIL (síndico/sub-síndico/...) no lugar do CPF - informação bem mais útil
 * pra identificar quem é quem. Limpa o próprio texto assim que seleciona - o pai só
 * acumula a lista de destinatários antes do primeiro envio, sem um passo de "confirmar"
 * separado (diferente do fluxo de responsável), então não precisa do truque de
 * `valorSelecionado` controlado de fora. */
export function ComboDestinatarioMensagemPrivada({ candidatos, onSelecionar, placeholder = "Nome do funcionário" }: Props) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  const buscaNormalizada = busca.trim().toLowerCase();
  const sugeridos = useMemo(() => {
    if (!candidatos || buscaNormalizada.length === 0) return [];
    return candidatos.filter((c) => c.nome.toLowerCase().includes(buscaNormalizada)).slice(0, 8);
  }, [candidatos, buscaNormalizada]);

  function selecionar(c: CandidatoDestinatarioResponse) {
    setBusca("");
    setAberto(false);
    onSelecionar(c);
  }

  return (
    <div className="relative">
      <Input
        placeholder={candidatos === null ? "Carregando..." : placeholder}
        value={busca}
        disabled={candidatos === null}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
      />
      {aberto && sugeridos.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {sugeridos.map((c) => (
            <li key={c.cpf}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selecionar(c)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {rotulo(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && candidatos && buscaNormalizada.length > 0 && sugeridos.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 shadow-lg">
          Ninguém encontrado.
        </div>
      )}
    </div>
  );
}
