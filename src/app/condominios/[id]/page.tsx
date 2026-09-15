"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buscarCondominio, CondominioResponse, CondominioTipo } from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell } from "@/components/app-shell";

const TIPO_LABEL: Record<CondominioTipo, string> = {
  apartamento: "Apartamento",
  casas: "Casas",
};

export default function CondominioDetalhePage() {
  const sessao = useSessaoObrigatoria();
  const params = useParams<{ id: string }>();

  const [condominio, setCondominio] = useState<CondominioResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!sessao) return;
    buscarCondominio(sessao.token, Number(params.id))
      .then(setCondominio)
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar."));
  }, [sessao, params.id]);

  if (!sessao) return null;

  return (
    <AppShell sessao={sessao}>
      <Link href="/condominios" className="text-sm text-slate-500 hover:text-slate-900">
        ← Condomínios
      </Link>

      {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

      {condominio && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">{condominio.nome}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-slate-400">CNPJ</dt>
            <dd className="text-slate-900">{condominio.cnpj}</dd>
            <dt className="text-slate-400">Tipo</dt>
            <dd className="text-slate-900">{TIPO_LABEL[condominio.tipo]}</dd>
            {condominio.tipo === "casas" && (
              <>
                <dt className="text-slate-400">Quantidade de casas</dt>
                <dd className="text-slate-900">{condominio.quantidadeCasas ?? "—"}</dd>
              </>
            )}
            {condominio.tipo === "apartamento" && (
              <>
                <dt className="text-slate-400">Quantidade de blocos</dt>
                <dd className="text-slate-900">{condominio.quantidadeBlocos ?? 0}</dd>
              </>
            )}
            <dt className="text-slate-400">Funcionários ativos</dt>
            <dd className="text-slate-900">{condominio.quantidadeFuncionariosAtivos}</dd>
            <dt className="text-slate-400">Situação</dt>
            <dd className="text-slate-900">{condominio.situacao === "ativo" ? "Ativo" : "Inativo"}</dd>
          </dl>

          <p className="mt-6 text-sm italic text-slate-400">
            Funcionários, moradores, quadro de avisos, colunas do Kanban e etiquetas se
            gerenciam pelo ícone de editar na lista de condomínios.
          </p>
        </div>
      )}
    </AppShell>
  );
}
