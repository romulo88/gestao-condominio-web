"use client";

import { useState } from "react";
import { criarDemanda, uploadDocumentoDemanda, DemandaDocumentoResponse, DemandaResponse } from "@/lib/api";
import { Sessao } from "@/lib/session";
import { MarkdownEditor } from "@/components/markdown-editor";
import { UploadImagens } from "@/components/upload-imagens";
import { Button, Input } from "@/components/ui";

// `identificarSolicitante: null` = "segue o padrão do papel de quem tá logado" (marcado
// pra funcionário, desmarcado pra morador) - só vira um boolean explícito quando a
// pessoa mexe na caixa. Evita um efeito só pra sincronizar o valor inicial com a sessão.
const FORM_VAZIO = { titulo: "", descricao: "", sigilosa: false, identificarSolicitante: null as boolean | null };

/**
 * Formulário de cadastro de demanda (título, descrição, sigilo, imagens/vídeo) - extraído
 * de `demandas/page.tsx` pra ser reaproveitado sem duplicar também na tela de ronda
 * (feature "Controle de Rondas", pedido do Romulo: "Reutilize o componente atual, sem
 * criar um formulário novo"). O toggle "+ Nova demanda"/agrupador expansível é chrome de
 * cada página que usa este componente, não faz parte dele.
 *
 * `rondaId`, quando informado, vincula a demanda nova à ronda em andamento (backend exige
 * que quem está logado seja o dono dessa ronda e que ela ainda esteja em andamento).
 *
 * `aoCriar` sempre é chamado ao final de um cadastro bem-sucedido (mesmo que algum anexo
 * tenha falhado ao subir) - `semFalhaDeImagem` diz se deu tudo certo, pra quem chama
 * decidir se fecha o formulário/modal (mesmo comportamento de antes: só fecha quando não
 * sobrou erro pra mostrar).
 */
export function FormNovaDemanda({
  sessao,
  rondaId,
  aoCriar,
}: {
  sessao: Sessao;
  rondaId?: number;
  aoCriar: (info: { demanda: DemandaResponse; documentos: DemandaDocumentoResponse[]; semFalhaDeImagem: boolean }) => void;
}) {
  const [campos, setCampos] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [imagensNovas, setImagensNovas] = useState<File[]>([]);

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      const nova = await criarDemanda(sessao.token, {
        titulo: campos.titulo,
        descricao: campos.descricao,
        sigilosa: campos.sigilosa,
        identificarSolicitante: campos.identificarSolicitante ?? sessao.tipoPapel === "funcionario",
        rondaId,
      });
      setCampos(FORM_VAZIO);
      // A demanda já nasceu - as imagens só têm onde subir depois disso (o upload exige
      // um demandaId real, ver DemandaDocumentoController). Uma falha aqui não desfaz a
      // demanda: ela já foi criada, só o(s) anexo(s) que não entraram.
      let semFalhaDeImagem = true;
      let enviados: DemandaDocumentoResponse[] = [];
      if (imagensNovas.length > 0) {
        const resultados = await Promise.allSettled(
          imagensNovas.map((arquivo) => uploadDocumentoDemanda(sessao.token, nova.id, arquivo)),
        );
        enviados = resultados
          .filter((r): r is PromiseFulfilledResult<DemandaDocumentoResponse> => r.status === "fulfilled")
          .map((r) => r.value);
        setImagensNovas([]);
        const falhas = resultados.filter((r) => r.status === "rejected").length;
        if (falhas > 0) {
          semFalhaDeImagem = false;
          setErroForm(`Demanda cadastrada, mas ${falhas} imagem(ns) não subiu(ram) - tente anexar de novo.`);
        }
      }
      aoCriar({ demanda: nova, documentos: enviados, semFalhaDeImagem });
    } catch (err) {
      setErroForm(err instanceof Error ? err.message : "Falha ao cadastrar demanda.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={handleCriar} className="space-y-3">
      <Input
        required
        placeholder="Título"
        value={campos.titulo}
        onChange={(e) => setCampos((c) => ({ ...c, titulo: e.target.value }))}
      />
      <MarkdownEditor
        required
        placeholder="Descrição"
        value={campos.descricao}
        onChange={(descricao) => setCampos((c) => ({ ...c, descricao }))}
        rows={6}
      />
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={campos.sigilosa}
          onChange={(e) => setCampos((c) => ({ ...c, sigilosa: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        Demanda sigilosa
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={campos.identificarSolicitante ?? sessao.tipoPapel === "funcionario"}
          onChange={(e) => setCampos((c) => ({ ...c, identificarSolicitante: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        Mostrar meu nome pros funcionários (aparece em &quot;Aberta por&quot;)
      </label>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
          Imagens e vídeo (opcional)
        </p>
        <UploadImagens arquivos={imagensNovas} onChange={setImagensNovas} />
      </div>

      {erroForm && <p className="text-sm text-red-600">{erroForm}</p>}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
