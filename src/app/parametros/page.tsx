"use client";

import { useEffect, useMemo, useState } from "react";
import {
  atualizarParametro,
  criarParametro,
  excluirParametro,
  listarParametros,
  ParametroResponse,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell } from "@/components/app-shell";
import { IconeLapis, IconeLixeira } from "@/components/icons";
import { Button, Input } from "@/components/ui";

/** Tela de administração dos parâmetros gerais do sistema (pedido do Romulo): valor de
 * regra de negócio (ex: máximo de fotos por demanda) editável aqui, sem precisar de
 * deploy - hoje só `DemandaDocumentoService` lê algum (`maximoFotos`/`maximoVideos`/
 * `tamanhoMaximoFotoMb`/`tamanhoMaximoVideoMb`, semeados pela migration V19), mas a
 * tabela é livre - cadastrar um nome novo aqui não tem efeito sozinho, só quando algum
 * código passar a ler esse nome (`ParametroService.getInt`).
 *
 * 100% administrador-only, no backend e aqui - nem síndico vê essa tela (é configuração
 * do sistema como um todo, não de um condomínio específico, diferente de tudo em
 * `/condominios`). Não aparece no menu pra quem não é administrador; quem tentar entrar
 * pela URL direto recebe o mesmo aviso desta página em vez de uma chamada à API que só
 * devolveria 403. */
export default function ParametrosPage() {
  const sessao = useSessaoObrigatoria();

  const [parametros, setParametros] = useState<ParametroResponse[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [formAberto, setFormAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Edição inline na própria linha - mesmo padrão de `etiquetaEditando` em `/condominios`.
  const [editando, setEditando] = useState<number | null>(null);
  const [edicao, setEdicao] = useState({ descricao: "", valor: "" });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  const ehAdministrador = sessao?.tipoPapel === "administrador";

  useEffect(() => {
    if (!sessao || !ehAdministrador) return;
    listarParametros(sessao.token)
      .then(setParametros)
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar."));
  }, [sessao, ehAdministrador]);

  // Filtro por descrição (pedido do Romulo) - só no cliente, a lista inteira já foi
  // carregada de uma vez (não é uma tabela grande o bastante pra valer filtrar no servidor).
  const parametrosFiltrados = useMemo(() => {
    if (!parametros) return parametros;
    const buscaTexto = busca.trim().toLowerCase();
    if (!buscaTexto) return parametros;
    return parametros.filter((p) => (p.descricao ?? "").toLowerCase().includes(buscaTexto));
  }, [parametros, busca]);

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setErro(null);
    setSalvando(true);
    try {
      const novo = await criarParametro(sessao.token, {
        nome: novoNome,
        descricao: novaDescricao.trim() === "" ? null : novaDescricao,
        valor: novoValor,
      });
      setParametros((atual) => [...(atual ?? []), novo].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoNome("");
      setNovaDescricao("");
      setNovoValor("");
      setFormAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao cadastrar parâmetro.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(p: ParametroResponse) {
    setEditando(p.id);
    setEdicao({ descricao: p.descricao ?? "", valor: p.valor });
    setErro(null);
  }

  async function handleSalvarEdicao(id: number) {
    if (!sessao) return;
    setErro(null);
    setSalvandoEdicao(true);
    try {
      const atualizado = await atualizarParametro(sessao.token, id, {
        descricao: edicao.descricao.trim() === "" ? null : edicao.descricao,
        valor: edicao.valor,
      });
      setParametros((atual) => atual?.map((p) => (p.id === id ? atualizado : p)) ?? null);
      setEditando(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function handleExcluir(p: ParametroResponse) {
    if (!sessao) return;
    if (!window.confirm(`Excluir o parâmetro "${p.nome}"? Se algum código ainda ler esse nome, ele volta a usar o valor padrão embutido.`)) {
      return;
    }
    setErro(null);
    setExcluindoId(p.id);
    try {
      await excluirParametro(sessao.token, p.id);
      setParametros((atual) => atual?.filter((x) => x.id !== p.id) ?? null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao excluir.");
    } finally {
      setExcluindoId(null);
    }
  }

  if (!sessao) return null;

  if (!ehAdministrador) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">Só administrador tem acesso a esta tela.</p>
      </AppShell>
    );
  }

  return (
    <AppShell sessao={sessao}>
      <h1 className="text-center text-xl font-semibold text-slate-900">Parâmetros do sistema</h1>
      <p className="mx-auto mt-1 max-w-md text-center text-sm text-slate-500">
        Valores de regra de negócio (ex: limite de anexo numa demanda) - editar aqui não precisa de deploy.
      </p>

      <div className="mx-auto mt-6 max-w-2xl">
        <Input
          placeholder="Filtrar por descrição"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="mb-4"
        />

        {formAberto ? (
          <form onSubmit={handleCriar} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Novo parâmetro</p>
              <button
                type="button"
                onClick={() => setFormAberto(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <div>
                <label className="text-xs text-slate-500">
                  Nome (a chave que o código vai procurar - sem espaço nem acento)
                </label>
                <Input required placeholder="ex: maximoFotos" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Descrição (opcional)</label>
                <Input
                  placeholder="ex: Máximo de fotos por demanda"
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Valor</label>
                <Input required placeholder="ex: 3" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={() => setFormAberto(true)}>+ Novo parâmetro</Button>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Parâmetros cadastrados
          </div>
          {erro && <p className="p-4 text-sm text-red-600">{erro}</p>}
          {parametros === null && !erro && <p className="p-4 text-sm text-slate-500">Carregando...</p>}
          {parametros?.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum parâmetro cadastrado ainda.</p>}
          {parametros && parametros.length > 0 && parametrosFiltrados?.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Nenhum parâmetro bate com essa busca.</p>
          )}
          {parametrosFiltrados && parametrosFiltrados.length > 0 && (
            <div className="divide-y divide-slate-100">
              {parametrosFiltrados.map((p) =>
                editando === p.id ? (
                  <div key={p.id} className="space-y-2 p-4">
                    <p className="text-sm font-medium text-slate-900">{p.nome}</p>
                    <div>
                      <label className="text-xs text-slate-500">Descrição</label>
                      <Input
                        value={edicao.descricao}
                        onChange={(e) => setEdicao((v) => ({ ...v, descricao: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Valor</label>
                      <Input
                        required
                        value={edicao.valor}
                        onChange={(e) => setEdicao((v) => ({ ...v, valor: e.target.value }))}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="secondary" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                      <Button type="button" onClick={() => handleSalvarEdicao(p.id)} disabled={salvandoEdicao}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-slate-900">
                        {p.nome} <span className="font-sans text-slate-400">=</span>{" "}
                        <span className="font-semibold">{p.valor}</span>
                      </p>
                      {p.descricao && <p className="mt-0.5 text-xs text-slate-500">{p.descricao}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-slate-400">
                      <button
                        onClick={() => abrirEdicao(p)}
                        title="Editar"
                        disabled={excluindoId !== null}
                        className="hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <IconeLapis className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleExcluir(p)}
                        title="Excluir"
                        disabled={excluindoId !== null}
                        className="hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <IconeLixeira className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
