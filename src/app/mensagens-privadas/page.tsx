"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buscarConversaPrivada,
  CandidatoDestinatarioResponse,
  ConversaPrivadaDetalheResponse,
  ConversaPrivadaResumoResponse,
  criarConversaPrivada,
  enviarMensagemPrivada,
  listarCandidatosMensagemPrivada,
  listarConversasPrivadas,
  MensagemPrivadaResponse,
  removerFotoMensagemPrivada,
  uploadFotoMensagemPrivada,
  urlImagem,
} from "@/lib/api";
import { useSessaoObrigatoria } from "@/lib/use-sessao-obrigatoria";
import { AppShell, EVENTO_MENSAGEM_PRIVADA_ATUALIZADA } from "@/components/app-shell";
import { ComboDestinatarioMensagemPrivada } from "@/components/combo-destinatario-mensagem-privada";
import { IconeLixeira, IconeMensagemPrivada, IconeUpload } from "@/components/icons";
import { Button, Input } from "@/components/ui";

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Mensagem privada" (pedido do Romulo): conversa livre entre morador OU funcionário e um
 * ou mais funcionários com login do mesmo condomínio. Privacidade estrita - só quem
 * participa (autor + destinatários) enxerga, nem síndico por padrão.
 *
 * Três estados nessa única tela (sem sub-rota, o volume não justifica): lista de
 * conversas, formulário de conversa nova (escolhe destinatário(s) + primeira mensagem) e
 * o chat aberto (mensagens + campo de resposta). `EVENTO_MENSAGEM_PRIVADA_ATUALIZADA` é
 * disparado depois de abrir/criar/enviar, pra o destaque vermelho do ícone no menu
 * (`MenuMensagensPrivadas`, em `app-shell.tsx`) reagir na hora. */
export default function MensagensPrivadasPage() {
  const sessao = useSessaoObrigatoria();
  const permitido = sessao?.tipoPapel === "funcionario" || sessao?.tipoPapel === "morador";

  const [conversas, setConversas] = useState<ConversaPrivadaResumoResponse[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  // Paginado (pedido do Romulo: "mesma quantidade da listagem de demandas" - 20 por
  // página), mesmo padrão de `paginaDemanda`/`totalPaginasDemanda` em `/demandas`.
  const [pagina, setPagina] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(0);
  const [totalItens, setTotalItens] = useState(0);

  const [conversaAberta, setConversaAberta] = useState<ConversaPrivadaDetalheResponse | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [abrindoId, setAbrindoId] = useState<number | null>(null);

  const [formNovaAberto, setFormNovaAberto] = useState(false);
  const [candidatos, setCandidatos] = useState<CandidatoDestinatarioResponse[] | null>(null);
  const [destinatarios, setDestinatarios] = useState<CandidatoDestinatarioResponse[]>([]);
  const [textoNovaConversa, setTextoNovaConversa] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  const [textoResposta, setTextoResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviandoFotoDe, setEnviandoFotoDe] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  function recarregarLista(paginaAlvo = pagina) {
    if (!sessao) return;
    listarConversasPrivadas(sessao.token, paginaAlvo)
      .then((resultado) => {
        setConversas(resultado.itens);
        setTotalPaginas(resultado.totalPaginas);
        setTotalItens(resultado.totalItens);
        setErroLista(null);
      })
      .catch((err) => setErroLista(err instanceof Error ? err.message : "Falha ao carregar as conversas."));
  }

  useEffect(() => {
    if (!sessao || !permitido) return;
    recarregarLista(pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao, permitido, pagina]);

  async function abrirFormNovaConversa() {
    setFormNovaAberto(true);
    setErroNova(null);
    if (!sessao || candidatos !== null) return;
    try {
      setCandidatos(await listarCandidatosMensagemPrivada(sessao.token));
    } catch (err) {
      setErroNova(err instanceof Error ? err.message : "Falha ao carregar os funcionários.");
    }
  }

  function adicionarDestinatario(candidato: CandidatoDestinatarioResponse) {
    setDestinatarios((atual) => (atual.some((d) => d.cpf === candidato.cpf) ? atual : [...atual, candidato]));
  }

  function removerDestinatario(cpf: string) {
    setDestinatarios((atual) => atual.filter((d) => d.cpf !== cpf));
  }

  async function handleCriarConversa(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao) return;
    setErroNova(null);
    setCriando(true);
    try {
      const criada = await criarConversaPrivada(
        sessao.token,
        destinatarios.map((d) => d.cpf),
        textoNovaConversa,
      );
      setFormNovaAberto(false);
      setDestinatarios([]);
      setTextoNovaConversa("");
      setConversaAberta(criada);
      // Conversa nova entra ordenada "mais recente primeiro" - volta pra página 1 pra
      // garantir que ela apareça ao voltar pra lista. Chama `recarregarLista(0)` direto
      // (não só `setPagina(0)`) porque, se já estiver na página 1, `setPagina` com o
      // mesmo valor não dispararia o efeito que recarrega.
      setPagina(0);
      recarregarLista(0);
      window.dispatchEvent(new Event(EVENTO_MENSAGEM_PRIVADA_ATUALIZADA));
    } catch (err) {
      setErroNova(err instanceof Error ? err.message : "Falha ao criar a conversa.");
    } finally {
      setCriando(false);
    }
  }

  async function abrirConversa(id: number) {
    if (!sessao) return;
    setErroDetalhe(null);
    setAbrindoId(id);
    try {
      setConversaAberta(await buscarConversaPrivada(sessao.token, id));
      recarregarLista();
      window.dispatchEvent(new Event(EVENTO_MENSAGEM_PRIVADA_ATUALIZADA));
    } catch (err) {
      setErroDetalhe(err instanceof Error ? err.message : "Falha ao abrir a conversa.");
    } finally {
      setAbrindoId(null);
    }
  }

  async function handleEnviarResposta(e: React.FormEvent) {
    e.preventDefault();
    if (!sessao || !conversaAberta) return;
    setErroDetalhe(null);
    setEnviando(true);
    try {
      const nova = await enviarMensagemPrivada(sessao.token, conversaAberta.id, textoResposta);
      setConversaAberta((atual) => (atual ? { ...atual, mensagens: [...atual.mensagens, nova] } : atual));
      setTextoResposta("");
      recarregarLista();
      window.dispatchEvent(new Event(EVENTO_MENSAGEM_PRIVADA_ATUALIZADA));
    } catch (err) {
      setErroDetalhe(err instanceof Error ? err.message : "Falha ao enviar a mensagem.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleSelecionarFoto(mensagemId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!sessao || !arquivo) return;
    setErroDetalhe(null);
    setEnviandoFotoDe(mensagemId);
    try {
      const anexo = await uploadFotoMensagemPrivada(sessao.token, mensagemId, arquivo);
      setConversaAberta((atual) =>
        atual
          ? {
              ...atual,
              mensagens: atual.mensagens.map((m) => (m.id === mensagemId ? { ...m, anexos: [...m.anexos, anexo] } : m)),
            }
          : atual,
      );
    } catch (err) {
      setErroDetalhe(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    } finally {
      setEnviandoFotoDe(null);
    }
  }

  async function handleRemoverFoto(mensagem: MensagemPrivadaResponse, anexoId: number) {
    if (!sessao) return;
    setErroDetalhe(null);
    try {
      await removerFotoMensagemPrivada(sessao.token, anexoId);
      setConversaAberta((atual) =>
        atual
          ? {
              ...atual,
              mensagens: atual.mensagens.map((m) =>
                m.id === mensagem.id ? { ...m, anexos: m.anexos.filter((a) => a.id !== anexoId) } : m,
              ),
            }
          : atual,
      );
    } catch (err) {
      setErroDetalhe(err instanceof Error ? err.message : "Falha ao remover a foto.");
    }
  }

  const conversasComTexto = useMemo(
    () =>
      conversas?.map((c) => ({
        ...c,
        destinatariosTexto: c.destinatarios.map((d) => d.nome).join(", "),
        // Pedido do Romulo: identificar a unidade do morador na listagem - bloco só
        // aparece em condomínio de apartamentos (`autorBlocoNome` vem null em casas).
        autorUnidadeTexto:
          c.autorTipo === "morador" && c.autorNumeroUnidade
            ? c.autorBlocoNome
              ? `${c.autorBlocoNome} — ${c.autorNumeroUnidade}`
              : c.autorNumeroUnidade
            : null,
      })) ?? null,
    [conversas],
  );

  if (!sessao) return null;

  if (!permitido) {
    return (
      <AppShell sessao={sessao}>
        <p className="mt-10 text-center text-sm text-slate-500">
          Mensagem privada é só entre morador e funcionário - administrador não tem acesso.
        </p>
      </AppShell>
    );
  }

  if (conversaAberta) {
    return (
      <AppShell sessao={sessao}>
        <button
          type="button"
          onClick={() => setConversaAberta(null)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Voltar pras conversas
        </button>

        <div className="mx-auto mt-4 max-w-2xl">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">
              {conversaAberta.autorNome}{" "}
              <span className="font-normal text-slate-400">
                → {conversaAberta.destinatarios.map((d) => d.nome).join(", ")}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-slate-400">Iniciada em {formatarDataHora(conversaAberta.createdAt)}</p>
          </div>

          {erroDetalhe && <p className="mt-3 text-sm text-red-600">{erroDetalhe}</p>}

          <div className="mt-4 space-y-3">
            {conversaAberta.mensagens.map((m) => (
              <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                    m.minha ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"
                  }`}
                >
                  {!m.minha && <p className="text-xs font-medium opacity-70">{m.autorNome}</p>}
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                  {m.anexos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.anexos.map((a) => (
                        <div key={a.id} className="relative">
                          {
                            // eslint-disable-next-line @next/next/no-img-element -- servido pelo backend com token na query string, next/image não serve pra isso
                            <img
                              src={urlImagem(a.url, sessao.token)}
                              alt={a.nomeArquivo}
                              className="h-24 w-24 rounded object-cover"
                            />
                          }
                          {m.minha && (
                            <button
                              type="button"
                              onClick={() => handleRemoverFoto(m, a.id)}
                              title="Remover foto"
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-red-600 shadow"
                            >
                              <IconeLixeira className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={`mt-1 flex items-center gap-2 text-xs ${m.minha ? "text-slate-300" : "text-slate-400"}`}>
                    <span>{formatarDataHora(m.createdAt)}</span>
                    {m.minha && m.anexos.length === 0 && (
                      <>
                        <button
                          type="button"
                          disabled={enviandoFotoDe === m.id}
                          onClick={() => fileInputRefs.current[m.id]?.click()}
                          className="inline-flex items-center gap-1 hover:text-white disabled:opacity-50"
                        >
                          <IconeUpload className="h-3 w-3" />
                          {enviandoFotoDe === m.id ? "Enviando..." : "Foto"}
                        </button>
                        <input
                          ref={(el) => {
                            fileInputRefs.current[m.id] = el;
                          }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => handleSelecionarFoto(m.id, e)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleEnviarResposta} className="mt-4 flex gap-2">
            <Input
              required
              placeholder="Escreva uma mensagem..."
              value={textoResposta}
              onChange={(e) => setTextoResposta(e.target.value)}
            />
            <Button type="submit" disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar"}
            </Button>
          </form>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sessao={sessao}>
      <h1 className="flex items-center justify-center gap-2 text-center text-xl font-semibold text-slate-900">
        <IconeMensagemPrivada className="h-5 w-5" /> Mensagem privada
      </h1>
      <p className="mx-auto mt-1 max-w-md text-center text-sm text-slate-500">
        Conversa privada com {sessao.tipoPapel === "morador" ? "um ou mais funcionários" : "um morador ou outro funcionário"} -
        só quem participa vê.
      </p>

      <div className="mx-auto mt-6 max-w-2xl">
        {formNovaAberto ? (
          <form onSubmit={handleCriarConversa} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">Nova conversa</p>
              <button
                type="button"
                onClick={() => setFormNovaAberto(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <div>
                <label className="text-xs text-slate-500">
                  Destinatário(s) - funcionário(s) com login do condomínio (pode ser mais de um)
                </label>
                <ComboDestinatarioMensagemPrivada
                  candidatos={candidatos}
                  onSelecionar={adicionarDestinatario}
                  placeholder="Nome do funcionário"
                />
                {destinatarios.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {destinatarios.map((d) => (
                      <span
                        key={d.cpf}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                      >
                        {d.nome}
                        <button
                          type="button"
                          onClick={() => removerDestinatario(d.cpf)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500">Mensagem</label>
                <Input
                  required
                  placeholder="Escreva a mensagem"
                  value={textoNovaConversa}
                  onChange={(e) => setTextoNovaConversa(e.target.value)}
                />
              </div>
            </div>

            {erroNova && <p className="mt-2 text-sm text-red-600">{erroNova}</p>}

            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={criando || destinatarios.length === 0}>
                {criando ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={abrirFormNovaConversa}>+ Nova conversa</Button>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Minhas conversas
          </div>
          {erroLista && <p className="p-4 text-sm text-red-600">{erroLista}</p>}
          {conversas === null && !erroLista && <p className="p-4 text-sm text-slate-500">Carregando...</p>}
          {conversas?.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhuma conversa ainda.</p>}
          {conversasComTexto && conversasComTexto.length > 0 && (
            <div className="divide-y divide-slate-100">
              {conversasComTexto.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={abrindoId === c.id}
                  onClick={() => abrirConversa(c.id)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {c.autorNome}
                      {c.autorUnidadeTexto && (
                        <span className="font-normal text-slate-400"> ({c.autorUnidadeTexto})</span>
                      )}{" "}
                      <span className="font-normal text-slate-400">→ {c.destinatariosTexto}</span>
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {c.ultimaMensagemAutorNome ? `${c.ultimaMensagemAutorNome}: ` : ""}
                      {c.ultimaMensagemTexto}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">{formatarDataHora(c.ultimaMensagemEm)}</span>
                    {c.pendente && <span className="h-2.5 w-2.5 rounded-full bg-red-500" title="Não visto" />}
                  </div>
                </button>
              ))}
            </div>
          )}
          {conversas && conversas.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              <span>
                {totalItens} {totalItens === 1 ? "conversa" : "conversas"} — página {pagina + 1} de{" "}
                {Math.max(totalPaginas, 1)}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPagina((p) => Math.max(p - 1, 0))}
                  disabled={pagina === 0}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPagina((p) => Math.min(p + 1, totalPaginas - 1))}
                  disabled={pagina + 1 >= totalPaginas}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
