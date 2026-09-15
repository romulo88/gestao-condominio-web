// Service worker mínimo (funcionalidade PWA, pedido do Romulo) - só o necessário pra
// contar como app instalável nos navegadores que ainda exigem isso (Chrome moderno já
// nem exige mais pra instalar, mas não custa deixar registrado pra compatibilidade).
// De propósito SEM cache/offline - fora do escopo pedido (só instalação + ícone na tela
// inicial, abrindo direto em /demandas).
self.addEventListener("fetch", () => {
  // Não intercepta nada de verdade - deixa o navegador buscar normalmente da rede.
});
