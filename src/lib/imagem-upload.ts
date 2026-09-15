// Regra compartilhada por todo lugar que aceita imagem pra anexar (demanda ou foto de
// perfil) - mesmo limite do backend (DemandaDocumentoService/FuncionarioService).
// Centralizado aqui pra não desalinhar entre os lugares.
export const IMAGEM_TAMANHO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8MB
export const IMAGEM_TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Vídeo só é aceito em anexo de DEMANDA (não em foto de perfil) - pedido do Romulo:
// "Coloque vídeo, com no máximo 15mb". video/quicktime = .mov, o formato padrão de vídeo
// gravado num iPhone - o app é usado como PWA no celular (ver HANDOFF.md), então vale
// aceitar direto sem precisar converter.
//
// Os dois tamanhos máximos acima (imagem e vídeo) são só um espelho ESTÁTICO do valor
// default do backend - desde a v147 (tabela `parametros`), o administrador pode mudar o
// limite de verdade sem deploy, e esse arquivo aqui não sabe disso (não busca o valor
// atual da API). Não é um bug: o comentário de cada função abaixo já dizia que essa
// checagem no cliente é só "dar erro cedo, sem gastar uma chamada" - o backend SEMPRE
// confere de novo com o valor atual de `tamanhoMaximoFotoMb`/`tamanhoMaximoVideoMb`, que é
// quem manda de verdade. Se o administrador mudar o parâmetro, o efeito prático é só um
// desalinho temporário (ex: cliente deixa passar um arquivo que o servidor recusa, ou
// recusa cedo um que o servidor aceitaria) - nunca deixa passar algo que o backend não
// aceitaria.
export const VIDEO_TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024; // 15MB
export const VIDEO_TIPOS_ACEITOS = ["video/mp4", "video/webm", "video/quicktime"];

/** `accept` do `<input type="file">` que aceita anexo de demanda (imagem OU vídeo). */
export const ANEXO_DEMANDA_ACCEPT = [...IMAGEM_TIPOS_ACEITOS, ...VIDEO_TIPOS_ACEITOS].join(",");

/** Confere pelo `type` do `File` (ou por um mime-type já em mãos, ex: de um anexo já
 * enviado) se é vídeo - usado tanto na validação de upload quanto na hora de decidir se
 * a miniatura de um anexo já salvo é `<img>` ou `<video>`. */
export function ehVideo(arquivoOuTipoMime: File | string): boolean {
  const tipo = typeof arquivoOuTipoMime === "string" ? arquivoOuTipoMime : arquivoOuTipoMime.type;
  return VIDEO_TIPOS_ACEITOS.includes(tipo);
}

/** Separa arquivos válidos (tipo+tamanho) dos inválidos, com uma mensagem pronta pra
 * mostrar sobre cada rejeitado. Só imagem - usada pra foto de perfil (não aceita vídeo,
 * diferente de anexo de demanda - ver {@link separarAnexosDemandaValidos}). O backend
 * confere tudo de novo - isso aqui só dá erro cedo, sem gastar uma chamada. */
export function separarImagensValidas(arquivos: File[]): { validos: File[]; rejeitados: string[] } {
  const validos: File[] = [];
  const rejeitados: string[] = [];
  for (const arquivo of arquivos) {
    if (!IMAGEM_TIPOS_ACEITOS.includes(arquivo.type)) {
      rejeitados.push(`${arquivo.name} (não é imagem)`);
    } else if (arquivo.size > IMAGEM_TAMANHO_MAXIMO_BYTES) {
      rejeitados.push(`${arquivo.name} (maior que 8MB)`);
    } else {
      validos.push(arquivo);
    }
  }
  return { validos, rejeitados };
}

/** Mesma ideia de {@link separarImagensValidas}, mas pra anexo de DEMANDA - aceita
 * imagem (até 8MB) OU vídeo (até 15MB). O limite de QUANTIDADE por demanda (3 fotos, 1
 * vídeo - pedido do Romulo) não é conferido aqui: antes da demanda existir (`UploadImagens`)
 * não tem contagem nenhuma pra comparar, e depois de existir (`AdicionarAnexoBotao`) quem
 * sabe o que já foi salvo de verdade é o backend - a mensagem de erro dele ("Essa demanda
 * já tem o máximo de...") já chega pronta pro `erro` de cada tela. */
export function separarAnexosDemandaValidos(arquivos: File[]): { validos: File[]; rejeitados: string[] } {
  const validos: File[] = [];
  const rejeitados: string[] = [];
  for (const arquivo of arquivos) {
    if (ehVideo(arquivo)) {
      if (arquivo.size > VIDEO_TAMANHO_MAXIMO_BYTES) {
        rejeitados.push(`${arquivo.name} (vídeo maior que 15MB)`);
      } else {
        validos.push(arquivo);
      }
    } else if (IMAGEM_TIPOS_ACEITOS.includes(arquivo.type)) {
      if (arquivo.size > IMAGEM_TAMANHO_MAXIMO_BYTES) {
        rejeitados.push(`${arquivo.name} (imagem maior que 8MB)`);
      } else {
        validos.push(arquivo);
      }
    } else {
      rejeitados.push(`${arquivo.name} (não é imagem nem vídeo)`);
    }
  }
  return { validos, rejeitados };
}
