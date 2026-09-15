import { Fragment, ReactNode } from "react";

/** `**negrito**` e `*itálico*` na mesma linha - sem aninhar um dentro do outro (o editor
 * nunca gera isso, ver `MarkdownEditor`). Texto puro sempre passa direto. */
function formatarLinha(linha: string): ReactNode[] {
  return linha.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((trecho, i) => {
    if (trecho.startsWith("**") && trecho.endsWith("**")) {
      return <strong key={i}>{trecho.slice(2, -2)}</strong>;
    }
    if (trecho.startsWith("*") && trecho.endsWith("*")) {
      return <em key={i}>{trecho.slice(1, -1)}</em>;
    }
    return trecho;
  });
}

/** Mostra o texto salvo por `MarkdownEditor` com a formatação de verdade (negrito,
 * itálico, lista) em vez do marcador cru - continua sendo texto simples por trás, nunca
 * HTML (sem `dangerouslySetInnerHTML`, sem risco de injeção): cada trecho vira nó de
 * texto do React normal, só embrulhado em `<strong>`/`<em>`/`<li>`. Linha começando com
 * "- " vira item de lista; linha em branco separa parágrafos; quebra de linha simples
 * dentro de um parágrafo vira `<br/>`. */
export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const blocos: ReactNode[] = [];
  let paragrafo: string[] = [];
  let lista: string[] = [];

  function fecharParagrafo() {
    if (paragrafo.length === 0) return;
    blocos.push(
      <p key={`p-${blocos.length}`}>
        {paragrafo.map((linha, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {formatarLinha(linha)}
          </Fragment>
        ))}
      </p>,
    );
    paragrafo = [];
  }

  function fecharLista() {
    if (lista.length === 0) return;
    blocos.push(
      <ul key={`ul-${blocos.length}`} className="ml-4 list-disc">
        {lista.map((item, i) => (
          <li key={i}>{formatarLinha(item)}</li>
        ))}
      </ul>,
    );
    lista = [];
  }

  for (const linha of texto.split("\n")) {
    const itemLista = linha.match(/^-\s+(.*)/);
    if (itemLista) {
      fecharParagrafo();
      lista.push(itemLista[1]);
    } else if (linha.trim() === "") {
      fecharParagrafo();
      fecharLista();
    } else {
      fecharLista();
      paragrafo.push(linha);
    }
  }
  fecharParagrafo();
  fecharLista();

  return <div className={`space-y-1 ${className ?? ""}`}>{blocos}</div>;
}
