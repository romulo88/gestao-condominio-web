/** Shell visual compartilhado pelas telas "públicas" (antes de entrar no sistema):
 * login, e futuramente recuperação de senha / definir senha no primeiro acesso.
 * Padrão de cor do projeto (definido com o Romulo): painel de marca em gradiente
 * slate-950→blue-900 à esquerda (largura fixa, não 50% da tela), conteúdo em cartão
 * branco à direita com inputs `bg-slate-100` sem borda e botão primário pill
 * `bg-slate-900`. Reuse esse componente em vez de recriar o layout.
 *
 * Ícone + "Commander" ficavam no topo do painel azul (pedido do Romulo, v143: tirar da
 * parte azul e colocar na parte branca, no lugar do ícone de login) - agora vivem só em
 * {@link BrandMark}, no topo do formulário. Sem esse bloco no topo, o título precisa de
 * `flex-1 justify-center` própria pra continuar centralizado verticalmente (pedido do
 * Romulo, v144: sem isso ele subiu pro topo, porque só sobrou o copyright embaixo pro
 * `justify-between` de antes "empurrar" contra). */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen">
      <div className="relative hidden shrink-0 flex-col overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 p-12 text-white lg:flex lg:w-[440px] xl:w-[520px]">
        {/* Grade estilo "planta baixa" no fundo, evocando o desenho ER do projeto sem repetir marca de terceiros. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grade" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grade)" />
        </svg>

        <div className="relative flex flex-1 flex-col justify-center">
          <h1 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Mais controle para o seu condomínio.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
            Demandas, avisos e aprovações organizados num só lugar, com o
            controle de acesso certo pra cada papel.
          </p>
        </div>

        <p className="relative text-xs text-slate-400">
          © {new Date().getFullYear()} Commander
        </p>
      </div>

      <div className="flex w-full flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}

/** Ícone-marca do sistema (casa simples) - usado em {@link BrandMark} (telas públicas) e
 * na topbar depois de logado (`app-shell.tsx`). Mantém um único SVG fonte pra não
 * desalinhar entre os usos. */
export function IconeCasa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M4 21V9l8-6 8 6v12h-6v-7h-4v7H4z" />
    </svg>
  );
}

/** Marca centralizada usada no topo dos formulários das telas públicas (login, etc.) -
 * ícone + wordmark "Commander" (pedido do Romulo, v143: veio do topo do painel azul, que
 * antes tinha ícone+nome e agora fica só com a mensagem/copyright). Casinha, não o ícone
 * de login que ficava aqui antes - é a mesma marca do sistema usada no topo/topbar depois
 * de logado (ver {@link IconeCasa}, reaproveitado em `app-shell.tsx`). */
export function BrandMark() {
  return (
    <div className="mb-8 flex items-center justify-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900">
        <IconeCasa className="h-5 w-5 text-white" />
      </div>
      <span className="text-lg font-semibold tracking-wide text-slate-900">Commander</span>
    </div>
  );
}
