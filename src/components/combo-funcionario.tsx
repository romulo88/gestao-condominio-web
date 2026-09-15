"use client";

import { useMemo, useState } from "react";
import { CandidatoResponsavelResponse } from "@/lib/api";
import { formatarCpf } from "@/lib/format";
import { Input } from "@/components/ui";

type Props = {
  /** `null` enquanto ainda está carregando. */
  candidatos: CandidatoResponsavelResponse[] | null;
  onSelecionar: (cpfFormatado: string) => void;
  placeholder?: string;
  /** CPF selecionado guardado pelo formulário pai (ex: `novoResponsavelCpfPorDemanda[d.id]`).
   * Só serve pra saber quando o pai LIMPOU esse campo (ex: depois de "Atribuir" com
   * sucesso) e então limpar o texto exibido aqui também - sem isso o texto da pessoa
   * selecionada ficava preso na tela mesmo com o formulário "limpo" por baixo. */
  valorSelecionado: string;
};

function rotulo(c: CandidatoResponsavelResponse): string {
  return `${c.nome} — ${formatarCpf(c.cpf)}`;
}

/** Combo com sugestão pro "Atribuir responsável" - mesmo padrão do `ComboPessoa` (item
 * 4.8), só que mais simples: candidato é sempre funcionário, sem unidade nem distinção
 * de papel. Digitar filtra por nome ou CPF; clicar numa sugestão chama `onSelecionar`
 * com o CPF já formatado - "Atribuir" continua um passo separado, de propósito. */
export function ComboFuncionario({
  candidatos,
  onSelecionar,
  placeholder = "Nome ou CPF",
  valorSelecionado,
}: Props) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  // Ajusta o texto exibido durante a renderização (não num efeito - regra do
  // `react-hooks/set-state-in-effect`) quando o pai limpa `valorSelecionado` de fora (ex:
  // depois de "Atribuir" com sucesso) - sem isso o texto da pessoa selecionada ficava
  // preso na tela mesmo com o formulário "limpo" por baixo.
  const [ultimoValorSelecionado, setUltimoValorSelecionado] = useState(valorSelecionado);
  if (valorSelecionado !== ultimoValorSelecionado) {
    setUltimoValorSelecionado(valorSelecionado);
    if (valorSelecionado === "") setBusca("");
  }

  const buscaNormalizada = busca.trim().toLowerCase();
  const buscaDigitos = buscaNormalizada.replace(/\D/g, "");
  const sugeridos = useMemo(() => {
    if (!candidatos || buscaNormalizada.length === 0) return [];
    return candidatos
      .filter(
        (c) => c.nome.toLowerCase().includes(buscaNormalizada) || (buscaDigitos.length > 0 && c.cpf.includes(buscaDigitos)),
      )
      .slice(0, 8);
  }, [candidatos, buscaNormalizada, buscaDigitos]);

  function selecionar(c: CandidatoResponsavelResponse) {
    setBusca(rotulo(c));
    setAberto(false);
    onSelecionar(formatarCpf(c.cpf));
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
