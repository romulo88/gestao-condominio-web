"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ContextoDto,
  existePendenciaMensagemPrivada,
  labelContexto,
  listarDemandas,
  listarMeusContextos,
  PERFIL_LABEL,
  trocarContexto,
} from "@/lib/api";
import { destinoPosLogin, limparSessao, salvarSessao, Sessao } from "@/lib/session";
import { IconeCasa } from "@/components/auth-layout";
import { IconeMensagemPrivada, IconeSair } from "@/components/icons";
import { SinoTarefas } from "@/components/sino-tarefas";
import { MenuNotasPendentes } from "@/components/menu-notas-pendentes";
import { MenuEtapaVencida } from "@/components/menu-etapa-vencida";
import { AlertaMudancasStatus } from "@/components/alerta-mudancas-status";

/** Links de navegação ao lado da marca, no topo - "ir pra uma tela". Cada um aparece só
 * pra quem realmente usa aquela tela: "Cadastro de condomínio" é administrador/
 * funcionário (morador não gerencia condomínio); "Demandas" é funcionário/morador
 * (administrador não abre/atende demanda, não tem condomínio próprio); "Kanban" é
 * funcionário/morador - morador só acompanha (sem "+ Nova demanda", sem arrastar card,
 * sem etiqueta - ver `kanban/page.tsx`), administrador não usa (não tem condomínio).
 * Diferente de `MenuIconesAlerta` (nota/etapa/tarefa) - ver lá o porquê da separação.
 * Pedido do Romulo (teste visual): sem ícone, só texto, separado por "|" em azul claro -
 * mesma cor do traço que já separava a marca "Commander" desse grupo. */
function MenuIconesNav({ sessao }: { sessao: Sessao }) {
  const podeGerenciarCondominio = sessao.tipoPapel !== "morador";
  const podeVerDemandas = sessao.tipoPapel === "funcionario" || sessao.tipoPapel === "morador";
  const podeVerKanban = sessao.tipoPapel === "funcionario" || sessao.tipoPapel === "morador";
  // Parâmetros gerais do sistema (pedido do Romulo, v147) - configuração do sistema
  // TODO, não de um condomínio específico, por isso não fica junto de "Condomínio" -
  // 100% administrador, nem síndico vê esse link (mesma exclusividade do backend, ver
  // `Autorizacao.exigirAdministrador`).
  const podeVerParametros = sessao.tipoPapel === "administrador";

  const itens: { href: string; title: string; label: string }[] = [
    ...(podeGerenciarCondominio ? [{ href: "/condominios", title: "Cadastro de condomínio", label: "Condomínio" }] : []),
    ...(podeVerDemandas ? [{ href: "/demandas", title: "Demandas", label: "Demanda" }] : []),
    ...(podeVerKanban ? [{ href: "/kanban", title: "Kanban", label: "Visão" }] : []),
    ...(podeVerParametros ? [{ href: "/parametros", title: "Parâmetros do sistema", label: "Parâmetros" }] : []),
  ];

  if (itens.length === 0) return null;

  return (
    <nav className="flex items-center border-l border-blue-300/50 pl-3">
      {itens.map((item, i) => (
        <span key={item.href} className="flex items-center">
          {i > 0 && <span className="mx-2 text-blue-300/50">|</span>}
          <Link
            href={item.href}
            title={item.title}
            className="text-xs font-medium text-slate-200 hover:text-white"
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

// Intervalo da atualização periódica dos ícones de alerta (nota pendente/etapa vencida) -
// pedido do Romulo: o ícone ficava "preso" laranja/vermelho depois de resolver tudo,
// porque só buscava a lista uma vez, ao montar (sem remontar não tinha como saber que
// algo mudou). Refazer a cada 1 minuto é barato (uma listagem leve só, não a demanda
// inteira com notas/etapas) e resolve sem precisar deslogar/relogar nem recarregar a
// página. 60s é frequente o bastante pra não parecer "travado" e raro o bastante pra não
// pesar - ajustar aqui se um dia precisar de outro equilíbrio.
const INTERVALO_ATUALIZACAO_ALERTAS_MS = 60_000;

/** Evento leve (sem payload) pra avisar o menu "algo mudou, vale reconferir os alertas
 * agora" - pedido do Romulo: cadastrar nota/concluir etapa no card do Kanban já atualiza
 * o CARD na hora (estado local, sem round-trip), mas o menu no topo é um componente
 * separado que não sabe disso sozinho; sem isso, ficaria até 1 minuto (ou até trocar de
 * aba) desatualizado. Quem muda uma demanda dispara esse evento (ver `kanban/page.tsx`) em
 * vez de todo mundo escutar tudo o tempo inteiro - só gera UMA busca extra, na hora certa,
 * nunca em intervalo/polling. */
export const EVENTO_ALERTAS_DEMANDAS = "commander:alertas-demandas-atualizados";

/** Mesma ideia de `EVENTO_ALERTAS_DEMANDAS`, só que pra Mensagem privada (pedido do
 * Romulo) - a página de mensagens dispara isso ao abrir uma conversa ou enviar uma
 * mensagem, pra o destaque vermelho do ícone no menu sumir/aparecer na hora, sem esperar o
 * próximo minuto do intervalo. */
export const EVENTO_MENSAGEM_PRIVADA_ATUALIZADA = "commander:mensagem-privada-atualizada";

/** Ícone de "mensagem privada não vista" no menu, redondo (balãozinho) - pedido do Romulo,
 * pros dois papéis (morador E funcionário, diferente de `MenuIconesAlerta` que é só
 * funcionário). Componente independente de propósito: é o único alerta que também existe
 * pro morador, então não faz sentido empilhar dentro de `MenuIconesAlerta` (que teria que
 * deixar de retornar `null` cedo pra morador só por causa desse um ícone). */
function MenuMensagensPrivadas({ sessao }: { sessao: Sessao }) {
  const [pendente, setPendente] = useState(false);

  useEffect(() => {
    if (sessao.tipoPapel !== "funcionario" && sessao.tipoPapel !== "morador") return;

    let cancelado = false;
    function atualizar() {
      existePendenciaMensagemPrivada(sessao.token)
        .then((valor) => {
          if (!cancelado) setPendente(valor);
        })
        .catch(() => {
          // Silencioso de propósito - é só um indicador ambiente no menu (mesmo espírito
          // de `MenuIconesAlerta`).
        });
    }

    atualizar();
    const intervalo = setInterval(atualizar, INTERVALO_ATUALIZACAO_ALERTAS_MS);
    function aoFicarVisivel() {
      if (document.visibilityState === "visible") atualizar();
    }
    document.addEventListener("visibilitychange", aoFicarVisivel);
    window.addEventListener(EVENTO_MENSAGEM_PRIVADA_ATUALIZADA, atualizar);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFicarVisivel);
      window.removeEventListener(EVENTO_MENSAGEM_PRIVADA_ATUALIZADA, atualizar);
    };
  }, [sessao.tipoPapel, sessao.token]);

  if (sessao.tipoPapel !== "funcionario" && sessao.tipoPapel !== "morador") return null;

  return (
    <Link
      href="/mensagens-privadas"
      title={pendente ? "Tem mensagem privada não vista - clique pra abrir" : "Mensagem privada"}
      className={`flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-800 ${
        pendente ? "text-red-400 hover:text-red-300" : "text-slate-200 hover:text-white"
      }`}
    >
      <IconeMensagemPrivada className="h-5 w-5" />
    </Link>
  );
}

/** Ícones de alerta - nota pendente, etapa em atraso e tarefas agendadas, só funcionário
 * (pedido do Romulo: "deixar destacado no centro do menu os ícones de alerta"). Grupo
 * separado de `MenuIconesNav` de propósito: são "avisos ambientes" (mudam de cor sozinhos
 * quando tem algo pra ver), não navegação comum, então ficam centralizados no header
 * inteiro em telas largas o bastante pra isso valer a pena (ver o grid de 3 colunas no
 * `AppShell`) - em telas estreitas o header volta a quebrar linha normalmente (mesmo
 * comportamento de sempre desde a v110), sem tentar forçar centralização que não cabe.
 *
 * A busca de "existe nota pendente"/"existe etapa vencida" mora AQUI (não dentro de cada
 * ícone) por dois motivos: (1) as duas perguntas vêm do mesmo `listarDemandas` - juntar
 * numa busca só evita pedir a mesma listagem duas vezes toda hora; (2) atualização
 * periódica (ver `INTERVALO_ATUALIZACAO_ALERTAS_MS`) fica centralizada num lugar só,
 * `MenuNotasPendentes`/`MenuEtapaVencida` viram componentes burros (só recebem o boolean
 * já calculado). Refaz também quando a aba volta a ficar visível (`visibilitychange`) -
 * pega o caso comum de "troquei de aba, resolvi lá, voltei aqui" sem esperar o próximo
 * minuto do intervalo. */
function MenuIconesAlerta({ sessao }: { sessao: Sessao }) {
  const [existeNotaPendente, setExisteNotaPendente] = useState(false);
  const [existeEtapaVencida, setExisteEtapaVencida] = useState(false);

  useEffect(() => {
    if (sessao.tipoPapel !== "funcionario") return;

    let cancelado = false;
    function atualizar() {
      listarDemandas(sessao.token)
        .then((lista) => {
          if (cancelado) return;
          setExisteNotaPendente(lista.some((d) => d.temNotaPendente));
          setExisteEtapaVencida(lista.some((d) => d.temEtapaVencida));
        })
        .catch(() => {
          // Silencioso de propósito - é só um indicador ambiente no menu, não vale
          // mostrar erro pra isso (a listagem de verdade em /demandas já mostra erro se
          // acontecer de verdade).
        });
    }

    atualizar();
    const intervalo = setInterval(atualizar, INTERVALO_ATUALIZACAO_ALERTAS_MS);
    function aoFicarVisivel() {
      if (document.visibilityState === "visible") atualizar();
    }
    document.addEventListener("visibilitychange", aoFicarVisivel);
    window.addEventListener(EVENTO_ALERTAS_DEMANDAS, atualizar);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFicarVisivel);
      window.removeEventListener(EVENTO_ALERTAS_DEMANDAS, atualizar);
    };
  }, [sessao.tipoPapel, sessao.token]);

  if (sessao.tipoPapel !== "funcionario") return null;

  return (
    <nav className="flex items-center gap-1">
      <MenuNotasPendentes existeNotaPendente={existeNotaPendente} />
      <MenuEtapaVencida existeEtapaVencida={existeEtapaVencida} />
      <SinoTarefas sessao={sessao} />
    </nav>
  );
}

/** "Administrador", "Síndico", "Funcionário" (sem perfil) ou "Morador" - o papel de quem
 * está logado, mostrado na topbar (sem o nome: quem está logado já sabe seu próprio nome). */
function labelPapel(sessao: Sessao): string {
  if (sessao.tipoPapel === "administrador") return "administrador";
  if (sessao.tipoPapel === "morador") return "morador";
  return sessao.perfil ? PERFIL_LABEL[sessao.perfil].toLowerCase() : "funcionário";
}

/** Shell das telas pós-login: topbar com marca + menu + nome/condomínio/perfil de quem
 * está logado + sair. Diferente do `AuthLayout` (split-screen com painel de marketing) -
 * aqui não faz sentido logado, então é só uma barra fina no topo + o conteúdo da página.
 *
 * `wide`: telas normais (formulário + listagem) cabem no `max-w-4xl` de sempre; `true`
 * dá mais espaço (`max-w-7xl`); `"full"` ocupa a tela toda de ponta a ponta - usado no
 * quadro Kanban, pra caber mais colunas visíveis sem precisar rolar. */
export function AppShell({
  sessao,
  children,
  wide = false,
}: {
  sessao: Sessao;
  children: React.ReactNode;
  wide?: boolean | "full";
}) {
  const router = useRouter();

  const [modalAberto, setModalAberto] = useState(false);
  const [contextos, setContextos] = useState<ContextoDto[] | null>(null);
  const [carregandoContextos, setCarregandoContextos] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [erroContexto, setErroContexto] = useState<string | null>(null);

  function sair() {
    limparSessao();
    router.push("/login");
  }

  async function abrirModalPerfil() {
    setModalAberto(true);
    setErroContexto(null);
    setCarregandoContextos(true);
    try {
      setContextos(await listarMeusContextos(sessao.token));
    } catch (err) {
      setErroContexto(err instanceof Error ? err.message : "Falha ao listar seus perfis.");
    } finally {
      setCarregandoContextos(false);
    }
  }

  function fecharModalPerfil() {
    if (trocando) return;
    setModalAberto(false);
  }

  function ehContextoAtual(c: ContextoDto): boolean {
    return (
      c.condominioId === sessao.condominioId && c.tipoPapel === sessao.tipoPapel && c.perfil === sessao.perfil
    );
  }

  async function handleTrocarContexto(c: ContextoDto) {
    if (ehContextoAtual(c)) {
      setModalAberto(false);
      return;
    }
    setErroContexto(null);
    setTrocando(true);
    try {
      const resposta = await trocarContexto(sessao.token, c.condominioId, c.tipoPapel);
      salvarSessao({
        token: resposta.token,
        nome: sessao.nome,
        tipoPapel: c.tipoPapel,
        perfil: c.perfil,
        condominioId: c.condominioId,
        condominioNome: c.condominioNome,
        // Trocar de perfil não é um login novo (mesma sessão, outro chapéu) - carrega o
        // valor de sempre, sem recalcular (ver `AlertaMudancasStatus`).
        ultimoLoginAnterior: sessao.ultimoLoginAnterior,
      });
      setModalAberto(false);
      router.push(destinoPosLogin(c.tipoPapel));
    } catch (err) {
      setErroContexto(err instanceof Error ? err.message : "Falha ao trocar de perfil.");
    } finally {
      setTrocando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Pedido do Romulo: header responsivo pro celular - antes era um `flex` sem quebra
          nenhuma, e com nome de condomínio grande + ícones de menu, estourava a largura da
          tela e "Sair"/badge de papel ficavam cortados fora da tela, sem rolagem visível
          pra alcançar. Base (`flex flex-wrap`): rede de segurança em tela estreita, se não
          couber numa linha quebra pra uma segunda em vez de cortar. A partir de `sm:`, vira
          grid de 3 colunas (`auto_1fr_auto`) pra centralizar de verdade o grupo do meio
          (`MenuIconesAlerta` - pedido do Romulo: "deixar destacado no centro do menu os
          ícones de alerta") entre a navegação (esquerda) e o perfil/sair (direita), sem
          depender das duas larguras serem iguais. */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-slate-900 px-4 py-3 text-white sm:grid sm:grid-cols-[auto_1fr_auto] sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* Ícone/nome do sistema leva pra tela inicial de quem está logado - mesmo
              destino do pós-login (`destinoPosLogin`): quadro de avisos pra
              funcionário/morador, cadastro de condomínio pra administrador (que não tem
              condomínio próprio pra ver avisos). */}
          <Link href={destinoPosLogin(sessao.tipoPapel)} className="flex items-center gap-2 hover:opacity-80">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/20 ring-1 ring-blue-400/40">
              <IconeCasa className="h-4 w-4 text-blue-300" />
            </div>
            <span className="text-sm font-medium tracking-wide">Commander</span>
          </Link>
          <MenuIconesNav sessao={sessao} />
        </div>
        <div className="flex items-center justify-center gap-1">
          <MenuIconesAlerta sessao={sessao} />
          <MenuMensagensPrivadas sessao={sessao} />
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 text-sm sm:gap-4">
          <button
            type="button"
            onClick={abrirModalPerfil}
            title="Trocar de perfil"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <span className="max-w-[140px] truncate sm:max-w-none">{sessao.condominioNome}</span>
            <span className="shrink-0 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
              {labelPapel(sessao)}
            </span>
          </button>
          <button
            onClick={sair}
            className="flex shrink-0 items-center gap-1 text-slate-300 hover:text-white"
          >
            <IconeSair className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>
      <main className={`mx-auto px-6 py-10 ${wide === "full" ? "max-w-none" : wide ? "max-w-7xl" : "max-w-4xl"}`}>
        {children}
      </main>

      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharModalPerfil}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Trocar de perfil</h2>
              <button
                type="button"
                onClick={fecharModalPerfil}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Escolha em qual condomínio/papel entrar - sem precisar deslogar.</p>

            <div className="mt-4 space-y-2">
              {carregandoContextos && <p className="text-sm text-slate-400">Carregando...</p>}
              {!carregandoContextos &&
                contextos?.map((c) => {
                  const atual = ehContextoAtual(c);
                  return (
                    <button
                      key={`${c.condominioId}-${c.tipoPapel}-${c.perfil ?? ""}`}
                      onClick={() => handleTrocarContexto(c)}
                      disabled={trocando}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition disabled:opacity-50 ${
                        atual
                          ? "border-blue-500 bg-blue-50 text-slate-900"
                          : "border-slate-200 text-slate-900 hover:border-blue-500 hover:bg-blue-50"
                      }`}
                    >
                      {labelContexto(c)}
                      {atual && <span className="text-xs font-medium text-blue-600">Atual</span>}
                    </button>
                  );
                })}
            </div>
            {erroContexto && <p className="mt-4 text-sm text-red-600">{erroContexto}</p>}
          </div>
        </div>
      )}

      <AlertaMudancasStatus sessao={sessao} />
    </div>
  );
}
