function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') {
    return '00.00.00';
  }

  const [ano, mes, dia] = dataISO.split('T')[0].split('-');
  return `${dia || '00'}.${mes || '00'}.${(ano || '').slice(-2) || '00'}`;
}

function normalizarNomePessoaParaArquivo(nomePessoa) {
  return String(nomePessoa || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function montarNomeBaseAtestado(record) {
  const nomePessoa = normalizarNomePessoaParaArquivo(record?.nome);
  const dataInicioCurta = formatarDataCurtaParaNome(record?.data_inicio);
  const tipo = String(record?.tipo_atestado || '');

  if (tipo === 'Declaração') {
    return `DECLARAÇÃO MÉDICA - ${dataInicioCurta} - ${nomePessoa}`;
  }

  if (tipo === 'Atestado de Óbito') {
    const grau = normalizarNomePessoaParaArquivo(record?.grau_parentesco);
    return `ATESTADO DE ÓBITO - ${dataInicioCurta}${grau ? ` (${grau})` : ''} - ${nomePessoa}`;
  }

  const totalDias = Number(record?.dias) || 0;
  const labelDias = totalDias === 1 ? 'DIA' : 'DIAS';
  return `ATESTADO MÉDICO - ${dataInicioCurta} (${totalDias} ${labelDias}) - ${nomePessoa}`;
}

function montarNomeArquivoAtestado(record, extensao = '.pdf', indice = 0, totalArquivos = 1) {
  const base = montarNomeBaseAtestado(record);
  const sufixo = totalArquivos > 1 ? ` - ANEXO ${indice + 1}` : '';
  return `${base}${sufixo}${extensao}`;
}

function normalizarNomeArquivoStorage(nomeArquivo, indice = 0) {
  const nomeLimpo = String(nomeArquivo || `arquivo-${indice + 1}.pdf`)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return nomeLimpo || `arquivo-${indice + 1}.pdf`;
}

window.formatarDataCurtaParaNome = formatarDataCurtaParaNome;
window.normalizarNomePessoaParaArquivo = normalizarNomePessoaParaArquivo;
window.montarNomeBaseAtestado = montarNomeBaseAtestado;
window.montarNomeArquivoAtestado = montarNomeArquivoAtestado;
window.normalizarNomeArquivoStorage = normalizarNomeArquivoStorage;
