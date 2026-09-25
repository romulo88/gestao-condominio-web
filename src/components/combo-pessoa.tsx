"use client";

import { useMemo, useState } from "react";
import { CandidatoAcessoResponse, PERFIL_LABEL } from "@/lib/api";
import { Input } from "@/components/ui";

type Props = {
  /** `null` enquanto ainda está carregando. */
  candidatos: CandidatoAcessoResponse[] | null;
  onSelecionar: (pessoaId: number) => void;
  placeholder?: string;
  /** Id da pessoa selecionada, guardado pelo formulário pai (ex:
   * `novoAcessoIdPorDemanda[d.id]`). Só serve pra saber quando o pai LIMPOU esse campo
   * (ex: depois de "Conceder" com sucesso) e então limpar o texto exibido aqui também -
   * sem isso o texto da pessoa selecionada ficava preso na tela mesmo com o formulário
   * "limpo" por baixo. */
  valorSelecionado: number | null;
};

/** "Nome (unidade)" (condomínio de casas, sem bloco) ou "Nome (bloco - unidade)"
 * (apartamento com bloco) pra morador; "Nome (cargo)" pra funcionário - pedido do Romulo:
 * moradores como visualizadores de demanda sigilosa buscam por nome, trazendo a unidade
 * entre parênteses (bloco - unidade quando o condomínio tiver bloco). */
function rotulo(c: CandidatoAcessoResponse): string {
  if (c.tipoPessoa === "morador") {
    const unidade = c.blocoNome ? `${c.blocoNome} - ${c.unidade}` : c.unidade ?? "";
    return unidade ? `${c.nome} (${unidade})` : c.nome;
  }
  const cargo = c.perfil ? PERFIL_LABEL[c.perfil] : c.funcao || "Sem perfil";
  return `${c.nome} (${cargo})`;
}

/** Combo com sugestão pro "Gerenciar acesso" (item 4.8): digitar filtra as pessoas ativas
 * do condomínio (`candidatos`, ver `listarCandidatosAcesso`) só por NOME (pedido do
 * Romulo); clicar numa sugestão chama `onSelecionar` com o id da pessoa - quem usa este
 * componente só precisa jogar esse id no mesmo lugar que já guardava antes (o "Conceder"
 * continua sendo um passo separado, de propósito - selecionar aqui não concede sozinho).
 * Sugestão mostra nome + unidade (morador) ou nome + cargo/função (funcionário) - CPF
 * saiu do sistema (v177/LGPD). */
export function ComboPessoa({
  candidatos,
  onSelecionar,
  placeholder = "Nome",
  valorSelecionado,
}: Props) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  // Ajusta o texto exibido durante a renderização (não num efeito - regra do
  // `react-hooks/set-state-in-effect`) quando o pai limpa `valorSelecionado` de fora (ex:
  // depois de "Conceder" com sucesso) - sem isso o texto da pessoa selecionada ficava
  // preso na tela mesmo com o formulário "limpo" por baixo.
  const [ultimoValorSelecionado, setUltimoValorSelecionado] = useState(valorSelecionado);
  if (valorSelecionado !== ultimoValorSelecionado) {
    setUltimoValorSelecionado(valorSelecionado);
    if (valorSelecionado === null) setBusca("");
  }

  const buscaNormalizada = busca.trim().toLowerCase();
  const sugeridos = useMemo(() => {
    if (!candidatos || buscaNormalizada.length === 0) return [];
    return candidatos.filter((c) => c.nome.toLowerCase().includes(buscaNormalizada)).slice(0, 8);
  }, [candidatos, buscaNormalizada]);

  function selecionar(c: CandidatoAcessoResponse) {
    setBusca(rotulo(c));
    setAberto(false);
    onSelecionar(c.pessoaId);
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
            <li key={`${c.tipoPessoa}-${c.pessoaId}`}>
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
