"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ContextoDto,
  labelContexto,
  login,
  selecionarContexto,
  trocarSenha,
  verificarIdentidade,
} from "@/lib/api";
import { destinoPosLogin, salvarSessao } from "@/lib/session";
import { apenasDigitos, formatarCpf } from "@/lib/format";
import { AuthLayout, BrandMark } from "@/components/auth-layout";
import { Button, Input } from "@/components/ui";
import { IconeOlho, IconeOlhoFechado } from "@/components/icons";

/** "Esqueceu sua senha?" abre um modal de 2 passos: CPF+e-mail (`verificarIdentidade`)
 * confirma quem é a pessoa, depois senha atual+nova (`trocarSenha`) troca de verdade -
 * é o mesmo fluxo pro primeiro acesso, já que toda pessoa nasce com uma senha padrão
 * conhecida que nunca serve pra logar de verdade (`Pessoa.precisaTrocarSenha`, ver
 * `AuthService` no backend - login barra enquanto essa flag estiver ligada). */
export default function LoginPage() {
  const router = useRouter();

  // Passo 1: cpf/senha. Passo 2 (só aparece se a pessoa tiver mais de 1 vínculo ativo):
  // escolher em qual condomínio + papel entrar.
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [manterConectado, setManterConectado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [contextos, setContextos] = useState<ContextoDto[] | null>(null);
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [ultimoLoginAnterior, setUltimoLoginAnterior] = useState<string | null>(null);

  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  // Modal "Esqueci minha senha": passo 1 (CPF+e-mail) confirma quem é a pessoa, passo 2
  // (senha atual + nova) troca de verdade. Ver AuthService no backend.
  const [modalEsqueciAberto, setModalEsqueciAberto] = useState(false);
  const [passoEsqueci, setPassoEsqueci] = useState<1 | 2>(1);
  const [esqueciCpf, setEsqueciCpf] = useState("");
  const [esqueciEmail, setEsqueciEmail] = useState("");
  const [esqueciSenhaAtual, setEsqueciSenhaAtual] = useState("");
  const [esqueciNovaSenha, setEsqueciNovaSenha] = useState("");
  const [esqueciConfirmarSenha, setEsqueciConfirmarSenha] = useState("");
  const [esqueciCarregando, setEsqueciCarregando] = useState(false);
  const [esqueciErro, setEsqueciErro] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await login(apenasDigitos(cpf), senha);
      setNome(resposta.nome);
      setUltimoLoginAnterior(resposta.ultimoLoginAnterior);
      if (resposta.token && resposta.contextos?.length === 1) {
        // Passa `resposta.ultimoLoginAnterior` direto em vez do estado (que ainda não
        // atualizou nesse mesmo tick - `setUltimoLoginAnterior` acima é assíncrono).
        finalizarLogin(resposta.nome, resposta.token, resposta.contextos[0], resposta.ultimoLoginAnterior);
      } else if (resposta.preAuthToken && resposta.contextos) {
        setPreAuthToken(resposta.preAuthToken);
        setContextos(resposta.contextos);
      } else {
        setErro("Resposta inesperada do servidor.");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setCarregando(false);
    }
  }

  async function handleEscolherContexto(contexto: ContextoDto) {
    if (!preAuthToken) return;
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await selecionarContexto(
        preAuthToken,
        contexto.condominioId,
        contexto.tipoPapel,
      );
      finalizarLogin(nome ?? "", resposta.token, contexto, ultimoLoginAnterior);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao escolher contexto.");
    } finally {
      setCarregando(false);
    }
  }

  function finalizarLogin(
    nome: string,
    token: string,
    contexto: ContextoDto,
    ultimoLoginAnterior: string | null,
  ) {
    salvarSessao({
      token,
      nome,
      tipoPapel: contexto.tipoPapel,
      perfil: contexto.perfil,
      condominioId: contexto.condominioId,
      condominioNome: contexto.condominioNome,
      ultimoLoginAnterior,
    });
    router.push(destinoPosLogin(contexto.tipoPapel));
  }

  function abrirModalEsqueci() {
    setPassoEsqueci(1);
    setEsqueciCpf(cpf);
    setEsqueciEmail("");
    setEsqueciSenhaAtual("");
    setEsqueciNovaSenha("");
    setEsqueciConfirmarSenha("");
    setEsqueciErro(null);
    setModalEsqueciAberto(true);
  }

  function fecharModalEsqueci() {
    if (esqueciCarregando) return;
    setModalEsqueciAberto(false);
  }

  async function handleVerificarIdentidade(e: React.FormEvent) {
    e.preventDefault();
    setEsqueciErro(null);
    setEsqueciCarregando(true);
    try {
      await verificarIdentidade(apenasDigitos(esqueciCpf), esqueciEmail);
      setPassoEsqueci(2);
    } catch (err) {
      setEsqueciErro(err instanceof Error ? err.message : "Falha ao conferir CPF e e-mail.");
    } finally {
      setEsqueciCarregando(false);
    }
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault();
    setEsqueciErro(null);
    if (esqueciNovaSenha !== esqueciConfirmarSenha) {
      setEsqueciErro("A nova senha e a confirmação não são iguais.");
      return;
    }
    if (esqueciNovaSenha.length < 8) {
      setEsqueciErro("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setEsqueciCarregando(true);
    try {
      await trocarSenha(apenasDigitos(esqueciCpf), esqueciEmail, esqueciSenhaAtual, esqueciNovaSenha);
      setModalEsqueciAberto(false);
      setCpf(formatarCpf(esqueciCpf));
      setSenha("");
      setMensagemSucesso("Senha alterada - já pode entrar com ela.");
    } catch (err) {
      setEsqueciErro(err instanceof Error ? err.message : "Falha ao trocar a senha.");
    } finally {
      setEsqueciCarregando(false);
    }
  }

  if (contextos) {
    return (
      <AuthLayout>
        <BrandMark />
        <h2 className="text-lg font-semibold text-slate-900">Escolha como entrar</h2>
        <p className="mt-1 text-sm text-slate-500">
          {nome}, você tem mais de um vínculo ativo.
        </p>
        <div className="mt-6 space-y-2">
          {contextos.map((c) => (
            <button
              key={`${c.condominioId}-${c.tipoPapel}`}
              onClick={() => handleEscolherContexto(c)}
              disabled={carregando}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-left text-sm text-slate-900 transition hover:border-blue-500 hover:bg-blue-50 disabled:opacity-50"
            >
              {labelContexto(c)}
            </button>
          ))}
        </div>
        {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <BrandMark />

      <form onSubmit={handleLogin} className="mt-6 space-y-3">
        <Input
          id="cpf"
          type="text"
          inputMode="numeric"
          autoComplete="username"
          required
          maxLength={14}
          value={cpf}
          onChange={(e) => setCpf(formatarCpf(e.target.value))}
          placeholder="CPF"
        />

        <div className="relative">
          <Input
            id="senha"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          >
            {mostrarSenha ? <IconeOlhoFechado className="h-5 w-5" /> : <IconeOlho className="h-5 w-5" />}
          </button>
        </div>

        <label className="flex items-center gap-2 pt-1 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={manterConectado}
            onChange={(e) => setManterConectado(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Manter conectado
        </label>

        {mensagemSucesso && <p className="text-sm text-emerald-600">{mensagemSucesso}</p>}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={abrirModalEsqueci}
            className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
          >
            Esqueceu sua senha?
          </button>
          <Button type="submit" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </Button>
        </div>
      </form>

      {modalEsqueciAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={fecharModalEsqueci}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Esqueceu sua senha?</h2>
              <button
                type="button"
                onClick={fecharModalEsqueci}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {passoEsqueci === 1 ? (
              <form onSubmit={handleVerificarIdentidade} className="mt-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Confirme seu CPF e o e-mail cadastrado pra trocar sua senha.
                </p>
                <Input
                  required
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="CPF"
                  value={esqueciCpf}
                  onChange={(e) => setEsqueciCpf(formatarCpf(e.target.value))}
                />
                <Input
                  required
                  type="email"
                  placeholder="E-mail cadastrado"
                  value={esqueciEmail}
                  onChange={(e) => setEsqueciEmail(e.target.value)}
                />
                {esqueciErro && <p className="text-sm text-red-600">{esqueciErro}</p>}
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={esqueciCarregando}>
                    {esqueciCarregando ? "Conferindo..." : "Continuar"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleTrocarSenha} className="mt-4 space-y-3">
                <p className="text-xs text-slate-400">CPF e e-mail confirmados - agora troque sua senha.</p>
                <Input
                  required
                  type="password"
                  autoComplete="current-password"
                  placeholder="Senha atual"
                  value={esqueciSenhaAtual}
                  onChange={(e) => setEsqueciSenhaAtual(e.target.value)}
                />
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  placeholder="Nova senha (mín. 8 caracteres)"
                  value={esqueciNovaSenha}
                  onChange={(e) => setEsqueciNovaSenha(e.target.value)}
                />
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirmar nova senha"
                  value={esqueciConfirmarSenha}
                  onChange={(e) => setEsqueciConfirmarSenha(e.target.value)}
                />
                {esqueciErro && <p className="text-sm text-red-600">{esqueciErro}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" onClick={() => setPassoEsqueci(1)} disabled={esqueciCarregando}>
                    Voltar
                  </Button>
                  <Button type="submit" disabled={esqueciCarregando}>
                    {esqueciCarregando ? "Salvando..." : "Trocar senha"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
