"use client";

import { useRef } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  id?: string;
};

const BOTAO_CLASSE =
  "flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-600 hover:bg-slate-200";

/** Editor "simples" pro campo Descrição (demanda e aviso): continua um `<textarea>` de
 * texto puro por trás (nada de HTML, nada de biblioteca externa) - só ganha uma barra que
 * insere `**negrito**`/`*itálico*`/`- item` na seleção atual (ou envolve um texto de
 * exemplo, se nada estiver selecionado). Quem lê o texto puro sem passar pelo componente
 * `Markdown` (ver markdown.tsx) ainda consegue entender o conteúdo - os marcadores são
 * discretos de propósito. */
export function MarkdownEditor({ value, onChange, rows = 6, placeholder, required, maxLength, id }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function envolverSelecao(marcador: string, exemplo: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const inicio = textarea.selectionStart;
    const fim = textarea.selectionEnd;
    const selecionado = value.slice(inicio, fim) || exemplo;
    const novoValor = value.slice(0, inicio) + marcador + selecionado + marcador + value.slice(fim);
    onChange(novoValor);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(inicio + marcador.length, inicio + marcador.length + selecionado.length);
    });
  }

  function inserirLista() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const inicio = textarea.selectionStart;
    const fim = textarea.selectionEnd;
    const selecionado = value.slice(inicio, fim) || "item";
    const linhas = selecionado
      .split("\n")
      .map((linha) => `- ${linha}`)
      .join("\n");
    // Garante que a lista comece numa linha própria - se o cursor não estiver logo
    // depois de uma quebra de linha (ou no começo do texto), entra uma quebra antes.
    const precisaQuebrarAntes = inicio > 0 && value[inicio - 1] !== "\n";
    const prefixo = precisaQuebrarAntes ? "\n" : "";
    const novoValor = value.slice(0, inicio) + prefixo + linhas + value.slice(fim);
    onChange(novoValor);
    requestAnimationFrame(() => {
      textarea.focus();
      const novoInicio = inicio + prefixo.length;
      textarea.setSelectionRange(novoInicio, novoInicio + linhas.length);
    });
  }

  return (
    <div>
      <div className="mb-1 flex gap-1">
        <button type="button" title="Negrito" onClick={() => envolverSelecao("**", "texto")} className={`${BOTAO_CLASSE} font-bold`}>
          B
        </button>
        <button type="button" title="Itálico" onClick={() => envolverSelecao("*", "texto")} className={`${BOTAO_CLASSE} italic`}>
          I
        </button>
        <button type="button" title="Lista" onClick={inserirLista} className={`${BOTAO_CLASSE} text-sm`}>
          •
        </button>
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="block w-full rounded-lg border-0 bg-slate-100 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
