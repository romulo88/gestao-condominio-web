type IconeProps = { className?: string };

export function IconeLapis({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 20l4-1 11-11a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0L4 15l-1 5z" />
    </svg>
  );
}

export function IconeLixeira({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

/** Checklist/prancheta - usado pro menu de Demandas ("tarefa"). */
export function IconeChecklist({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 9 1.5 1.5L12 8" />
      <path d="M14 9.5h4" />
      <path d="m8 15 1.5 1.5L12 14" />
      <path d="M14 15.5h4" />
    </svg>
  );
}

/** Relógio + engrenagem + check (andamento/status) sobre uma lista - usado pro menu de
 * Kanban. Mesma ideia do ícone de referência (tempo/processo/aprovação por cima de uma
 * checklist), adaptado ao nosso traço monocromático (currentColor, sem preenchimento). */
export function IconeKanban({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* relógio */}
      <circle cx="5" cy="5.2" r="2.3" />
      <path d="M5 3.9v1.3l0.9 0.9" />
      {/* engrenagem */}
      <circle cx="12" cy="5.2" r="1.9" />
      <path d="M12 2v0.9M12 7.7v0.9M8.9 5.2h0.9M14.2 5.2h0.9M9.8 3l0.6 0.6M13.6 6.8l0.6 0.6M14.2 3l-0.6 0.6M10.4 6.8l-0.6 0.6" />
      {/* check */}
      <path d="m16.6 5.4 1.3 1.3 2.5-2.7" />
      {/* checklist */}
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <path d="M7.5 12h12" />
      <circle cx="4.5" cy="16" r="1" fill="currentColor" />
      <path d="M7.5 16h12" />
      <circle cx="4.5" cy="20" r="1" fill="currentColor" />
      <path d="M7.5 20h12" />
    </svg>
  );
}

/** Upload (bandeja + seta pra cima) - usado no card do Kanban pra anexar imagem na
 * demanda. Mesma forma da referência do Romulo (ícone de compartilhar/exportar), no
 * nosso traço monocromático. */
export function IconeUpload({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      <path d="M8 7l4-4 4 4" />
      <path d="M12 3v12" />
    </svg>
  );
}

/** Olho - usado no card do Kanban pra abrir o gerenciamento de quem mais pode ver uma
 * demanda sigilosa (item 4.8). */
export function IconeOlho({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Olho riscado - par de `IconeOlho`, usado pro estado "senha oculta" do botão de
 * mostrar/ocultar senha (tela de login). */
export function IconeOlhoFechado({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/** Prédio com janelas - usada no menu do topo pra "Cadastro de condomínio". Antes esse
 * link reusava `IconeCasa` (a casinha, que é a marca do sistema) - ficavam idênticos lado
 * a lado no header, então trocado por um prédio de verdade (várias unidades, condiz com
 * "condomínio") pra diferenciar visualmente da marca. */
export function IconeEdificio({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-5h6v5" />
      <rect x="7.25" y="5.25" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="14.75" y="5.25" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="7.25" y="10" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="14.75" y="10" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="7.25" y="14.75" width="2" height="2" fill="currentColor" stroke="none" />
      <rect x="14.75" y="14.75" width="2" height="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Chave - usada na grid de Moradores pra "zerar senha" (reset pra padrão, quando o
 * morador esqueceu a senha atual). */
export function IconeChave({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="7" cy="15" r="4" />
      <path d="m10 12 9-9M15 6l3 3M18 3l3 3" />
    </svg>
  );
}

/** Relógio - usado no card do Kanban pra mostrar há quanto tempo a demanda está na
 * coluna atual (hover) e o histórico completo de colunas por onde já passou (clique). */
export function IconeRelogio({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/** Busto de pessoa cercado de interrogações (confusão/ociosidade) - usada no cabeçalho do
 * Kanban pra abrir a lista de funcionários sem nenhuma demanda atribuída no momento.
 * Mesma ideia da imagem de referência do Romulo (rosto em dúvida + interrogações ao
 * redor), simplificada pro nosso traço monocromático (sem preenchimento sólido). */
export function IconeFuncionarioOcioso({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* busto */}
      <circle cx="10.5" cy="8.3" r="3.3" />
      <path d="M4.5 21.5v-1.3c0-3.2 2.9-5.7 6.5-5.7.7 0 1.4.1 2 .3" />
      {/* interrogações espalhadas ao redor, remetendo à imagem de referência */}
      <g strokeWidth="1.3">
        <path d="M16.3 5.6c0-.9.8-1.6 1.7-1.6.9 0 1.6.6 1.6 1.4 0 .7-.4 1-1 1.4-.4.3-.6.6-.6 1.1" />
        <circle cx="17.8" cy="9.3" r="0.15" fill="currentColor" stroke="none" />
        <path d="M2.4 12.4c0-.8.7-1.4 1.5-1.4.8 0 1.4.5 1.4 1.2 0 .6-.3.9-.9 1.2-.4.2-.5.5-.5 1" />
        <circle cx="3.7" cy="15.6" r="0.13" fill="currentColor" stroke="none" />
        <path d="M15.5 14.9c0-.7.6-1.2 1.3-1.2.7 0 1.2.4 1.2 1 0 .5-.3.8-.8 1-.3.2-.5.4-.5.9" />
        <circle cx="16.6" cy="17.8" r="0.13" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

/** Sino - usado no menu do topo pra abrir as tarefas agendadas. Fica vermelho quando
 * alguma tarefa tem data (da tarefa, do 1º ou do 2º aviso) caindo hoje. */
export function IconeSino({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/** Caixa de arquivo (tampa + alça central) - usada no cabeçalho do Kanban pra abrir a
 * lista de demandas arquivadas. Trocada na v89 - o Romulo não gostou da primeira versão
 * (pasta aberta + documento) e escolheu essa entre 3 opções que mostrei num artifact. */
export function IconeArquivadas({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2.5" y="4" width="19" height="5" rx="1.2" />
      <path d="M3.5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

/** Etiqueta (preço/tag) - usada no card do Kanban pra abrir o cadastro de etiqueta da
 * demanda. Mesma forma da referência do Romulo (tag com furo), no nosso traço
 * monocromático. */
export function IconeEtiqueta({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12.6 2.6 20 10a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Raio - usado em "Aprovar de imediato" (/demandas), pra aprovação instantânea sem
 * passar por nenhuma coluna do Kanban. Escolhido pelo Romulo entre 3 conceitos de ícone
 * mostrados num artifact (junto de "Aprovar com Kanban"/"Recusar" abaixo). */
export function IconeRaio({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

/** Quadro de 3 colunas - usado em "Aprovar com Kanban" (/demandas), pra aprovação que
 * manda pra uma coluna do Kanban. Ver `IconeRaio`. */
export function IconeColunas({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="10" width="4.5" height="11" rx="1" />
      <rect x="9.75" y="5" width="4.5" height="16" rx="1" />
      <rect x="16.5" y="13" width="4.5" height="8" rx="1" />
    </svg>
  );
}

/** X num círculo - usado em "Recusar" (/demandas). Ver `IconeRaio`. */
export function IconeRecusar({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
    </svg>
  );
}

/** Pessoa + mais - usado em "Atribuir responsável" (/demandas), pra atribuir um ou mais
 * funcionários responsáveis pela demanda. Escolhido pelo Romulo (opção A) entre 3
 * conceitos mostrados num artifact. */
export function IconeResponsavel({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="10" cy="7.5" r="3.3" />
      <path d="M4 20.5v-1.3c0-3.2 2.7-5.7 6-5.7 1 0 2 .2 2.8.6" />
      <path d="M18 12.5v6M15 15.5h6" />
    </svg>
  );
}

/** Check num círculo - usada em "Notas" (/demandas) pra funcionário marcar uma nota como
 * lida. Escolhido pelo Romulo (opção A) entre 3 conceitos mostrados num artifact, mesmo
 * processo de IconeResponsavel/IconeRaio/IconeColunas/IconeRecusar. */
export function IconeNotaLida({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.6 2.6 5.4-6" />
    </svg>
  );
}

/** Balão de mensagem com "!" - usado no card do Kanban pra sinalizar que a demanda tem
 * nota ainda não lida ou sem resposta (pedido do Romulo). */
export function IconeNotaPendente({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="M12 8.7v3.2" />
      <circle cx="12" cy="14.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** "log-out" (porta com seta saindo) - usado no botão "Sair" do menu do topo (pedido do
 * Romulo, escolhido entre 4 opções sugeridas: log-out, arrow-right-from-bracket,
 * door-open, power). */
export function IconeSair({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

/** Selo de "play" (triângulo dentro de um círculo semitransparente) sobreposto na
 * miniatura de um anexo de vídeo - diferencia de foto sem precisar abrir o arquivo pra
 * saber (pedido do Romulo: anexo de demanda agora aceita vídeo além de foto). */
export function IconePlay({ className }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.55" />
      <path d="M10 8.3v7.4l6.2-3.7-6.2-3.7z" fill="white" />
    </svg>
  );
}

/** Elo de corrente (link) - pedido do Romulo: ícone na grid de Condomínios pra gerar o
 * link público de leitura do Kanban. */
export function IconeLink({ className }: IconeProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 15l6-6" />
      <path d="M10 6.5l1-1a4 4 0 0 1 5.5 5.5l-1 1" />
      <path d="M14 17.5l-1 1a4 4 0 0 1-5.5-5.5l1-1" />
    </svg>
  );
}

/** Alça de arrastar (6 pontinhos, 2 colunas x 3 linhas) - pedido do Romulo: reordenar as
 * colunas do Kanban por drag and drop em vez de digitar um número de ordem. Só decorativa
 * (indica que a linha é arrastável); o `draggable` de verdade vai na linha inteira. */
export function IconeArrastar({ className }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
