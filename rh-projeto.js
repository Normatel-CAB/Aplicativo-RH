const projetoTitulo = document.getElementById('projetoTitulo');
const projetoDescricao = document.getElementById('projetoDescricao');
const detalhesStatus = document.getElementById('detalhesStatus');
const detalhesContainer = document.getElementById('detalhesContainer');
const filtroNomeInput = document.getElementById('filtroNome');
const filtroDataInicioInput = document.getElementById('filtroDataInicio');
const filtroDataFimInput = document.getElementById('filtroDataFim');
const filtroTipoSelect = document.getElementById('filtroTipoAtestado');
const baixarFiltradosBtn = document.getElementById('baixarFiltradosBtn');


import { db, auth } from './firebase-config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

let registrosProjeto = [];
let registrosProjetoFiltrados = [];
let downloadMassaEmAndamento = false;

function setDetalhesStatus(texto, tipo = 'info') {
  detalhesStatus.textContent = texto;
  detalhesStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    detalhesStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    detalhesStatus.classList.add('status-message--success');
  } else {
    detalhesStatus.classList.add('status-message--info');
  }
}

function usuarioAprovado(modeloUsuario) {
  return Boolean(modeloUsuario && modeloUsuario.emailVisibility === true);
}

const BASES_PROJETO = {
  '736': 'Base Imbetiba',
  '737': 'Base Imboassica',
  '743': 'Bases: Cabiunas, Severina e Barra do Furado',
  '741': 'Bases: UTE, Áreas Externa e Tapera'
};

function iniciarPocketBase() {
  if (!window.POCKETBASE_CONFIG || !window.PocketBase) {
    return false;
  }

  const config = window.POCKETBASE_CONFIG;
  const baseUrlValida = typeof config.baseUrl === 'string' && /^https?:\/\//i.test(config.baseUrl);
  const collectionValida = typeof config.collection === 'string' && config.collection.trim().length > 0;

  if (!baseUrlValida || !collectionValida) {
    return false;
  }

  pocketbaseConfig = {
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    collection: config.collection
  };

  pocketbaseClient = new window.PocketBase(pocketbaseConfig.baseUrl);
  pocketbaseClient.autoCancellation(false);
  return true;
}

function formatarData(valorData) {
  if (!valorData || typeof valorData !== 'string') {
    return '-';
  }

  const partes = valorData.split('-');
  if (partes.length !== 3) {
    return valorData;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarDataHora(valorDataHora) {
  if (!valorDataHora || typeof valorDataHora !== 'string') {
    return '-';
  }

  const data = new Date(valorDataHora);
  if (Number.isNaN(data.getTime())) {
    return valorDataHora;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(data);
}

function normalizarTexto(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function obterDataISO(valorDataHora) {
  if (!valorDataHora || typeof valorDataHora !== 'string') {
    return '';
  }

  const data = new Date(valorDataHora);
  if (Number.isNaN(data.getTime())) {
    return '';
  }

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') {
    return '00.00.00';
  }

  const [ano, mes, dia] = dataISO.split('-');
  return `${dia || '00'}.${mes || '00'}.${(ano || '').slice(-2) || '00'}`;
}

function normalizarNomePessoaParaArquivo(nomePessoa) {
  return String(nomePessoa || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function montarNomePdfPorRegistro(record, indice = 0, totalArquivos = 1) {
  const nomePessoa = normalizarNomePessoaParaArquivo(record?.nome);
  const dataInicioCurta = formatarDataCurtaParaNome(record?.data_inicio);
  const tipo = String(record?.tipo_atestado || '');

  let base;
  if (tipo === 'Declaração') {
    base = `DECLARAÇÃO MÉDICA - ${dataInicioCurta} - ${nomePessoa}`;
  } else {
    const totalDias = Number(record?.dias) || 0;
    const labelDias = totalDias === 1 ? 'DIA' : 'DIAS';
    base = `ATESTADO MÉDICO - ${dataInicioCurta} (${totalDias} ${labelDias}) - ${nomePessoa}`;
  }

  if (totalArquivos > 1) {
    return `${base} - ANEXO ${indice + 1}.pdf`;
  }

  return `${base}.pdf`;
}


function montarLinkArquivo(record, urlArquivo) {
  // urlArquivo já é a URL do Firebase Storage
  return urlArquivo;
}

function montarUrlComFileToken(urlArquivo, fileToken) {
  const separador = urlArquivo.includes('?') ? '&' : '?';
  return `${urlArquivo}${separador}token=${encodeURIComponent(fileToken)}`;
}

async function obterUrlArquivoComToken(urlArquivo) {
  if (!pocketbaseClient?.files?.getToken) {
    return urlArquivo;
  }

  try {
    const tokenArquivo = await pocketbaseClient.files.getToken();
    if (!tokenArquivo) {
      return urlArquivo;
    }
    return montarUrlComFileToken(urlArquivo, tokenArquivo);
  } catch {
    return urlArquivo;
  }
}

async function baixarBlobArquivo(urlArquivo) {
  const urlFinal = await obterUrlArquivoComToken(urlArquivo);
  const resposta = await fetch(urlFinal, { credentials: 'omit' });

  if (!resposta.ok) {
    const mensagemErro = await resposta.text().catch(() => '');
    throw new Error(mensagemErro || `Falha ao baixar arquivo (HTTP ${resposta.status}).`);
  }

  return resposta.blob();
}

async function baixarArquivoComNome(urlArquivo, nomeDownload) {
  const blob = await baixarBlobArquivo(urlArquivo);
  const blobUrl = URL.createObjectURL(blob);
  const linkTemporario = document.createElement('a');
  linkTemporario.href = blobUrl;
  linkTemporario.download = nomeDownload;
  document.body.appendChild(linkTemporario);
  linkTemporario.click();
  linkTemporario.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function ativarDownloadComNome() {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.download-pdf-link');
    if (!link) {
      return;
    }

    event.preventDefault();

    const urlArquivo = link.getAttribute('href');
    const nomeCodificado = link.getAttribute('data-download-name') || '';
    const nomeDownload = nomeCodificado ? decodeURIComponent(nomeCodificado) : (link.getAttribute('download') || 'arquivo.pdf');

    try {
      await baixarArquivoComNome(urlArquivo, nomeDownload);
    } catch {
      const urlComToken = await obterUrlArquivoComToken(urlArquivo);
      window.location.href = urlComToken;
    }
  });
}

function criarDetalheItem(label, valor) {
  return `<div class="detalhe-item"><span>${label}</span><strong>${valor || '-'}</strong></div>`;
}

function criarCardRegistro(record) {
  const card = document.createElement('article');
  card.className = 'detalhe-card';


  const arquivos = Array.isArray(record.arquivos)
    ? record.arquivos
    : typeof record.arquivos === 'string' && record.arquivos
      ? [record.arquivos]
      : [];

  const arquivosHtml = arquivos.length
    ? arquivos
      .map((urlArquivo, indice) => {
        const nomeExibicao = montarNomePdfPorRegistro(record, indice, arquivos.length);
        return `<a class="download-pdf-link" href="${montarLinkArquivo(record, urlArquivo)}" download="${nomeExibicao}" data-download-name="${encodeURIComponent(nomeExibicao)}">${nomeExibicao}</a>`;
      })
      .join('<br>')
    : '-';

  card.innerHTML = `
    <h3>${record.nome || 'Sem nome informado'}</h3>
    <div class="detalhe-grid">
      ${criarDetalheItem('Função', record.funcao)}
      ${criarDetalheItem('Projeto', record.projeto)}
      ${criarDetalheItem('Tipo', record.tipo_atestado)}
      ${criarDetalheItem('Horas', record.horas_comparecimento || '-')}
      ${criarDetalheItem('Data início', formatarData(record.data_inicio))}
      ${criarDetalheItem('Data fim', formatarData(record.data_fim))}
      ${criarDetalheItem('Dias', record.dias)}
      ${criarDetalheItem('Enviado em', formatarDataHora(record.created))}
    </div>
    <div class="detalhe-arquivos">
      <span>Arquivo(s)</span>
      <div>${arquivosHtml}</div>
    </div>
  `;

  return card;
}

function coletarArquivosDosRegistros(registros) {
  return registros.flatMap((registro) => {
    const arquivos = Array.isArray(registro?.arquivos)
      ? registro.arquivos
      : typeof registro?.arquivos === 'string' && registro.arquivos
        ? [registro.arquivos]
        : [];

    return arquivos.map((urlArquivo, indice) => {
      return {
        url: montarLinkArquivo(registro, urlArquivo),
        nome: montarNomePdfPorRegistro(registro, indice, arquivos.length)
      };
    });
  });
}

function atualizarBotaoDownloadEmMassa() {
  if (!baixarFiltradosBtn) {
    return;
  }

  const totalArquivos = coletarArquivosDosRegistros(registrosProjetoFiltrados).length;
  baixarFiltradosBtn.textContent = totalArquivos > 0
    ? `Baixar PDFs filtrados (${totalArquivos})`
    : 'Baixar PDFs filtrados';
  baixarFiltradosBtn.disabled = totalArquivos === 0 || downloadMassaEmAndamento;
}

async function baixarPdfsFiltrados() {
  if (downloadMassaEmAndamento) {
    return;
  }

  const arquivosParaDownload = coletarArquivosDosRegistros(registrosProjetoFiltrados);
  if (!arquivosParaDownload.length) {
    setDetalhesStatus('Não há PDFs nos filtros atuais para baixar.', 'info');
    atualizarBotaoDownloadEmMassa();
    return;
  }

  if (!window.JSZip) {
    setDetalhesStatus('Biblioteca ZIP não carregada. Atualize a página e tente novamente.', 'error');
    return;
  }

  downloadMassaEmAndamento = true;
  atualizarBotaoDownloadEmMassa();

  let totalSucesso = 0;
  let totalFalha = 0;
  const zip = new window.JSZip();
  const nomesUsados = new Set();
  const detalhesFalhas = [];

  setDetalhesStatus(`Gerando ZIP com ${arquivosParaDownload.length} PDF(s) filtrado(s)...`, 'info');

  const params = new URLSearchParams(window.location.search);
  const codigoProjeto = params.get('projeto') || 'projeto';

  for (let indice = 0; indice < arquivosParaDownload.length; indice += 1) {
    const arquivo = arquivosParaDownload[indice];
    try {
      const blob = await baixarBlobArquivo(arquivo.url);
      let nomeFinal = arquivo.nome;
      if (nomesUsados.has(nomeFinal)) {
        const nomeBase = nomeFinal.endsWith('.pdf') ? nomeFinal.slice(0, -4) : nomeFinal;
        let sufixo = 2;
        while (nomesUsados.has(`${nomeBase} (${sufixo}).pdf`)) {
          sufixo += 1;
        }
        nomeFinal = `${nomeBase} (${sufixo}).pdf`;
      }

      nomesUsados.add(nomeFinal);
      zip.file(nomeFinal, blob);
      totalSucesso += 1;
    } catch (error) {
      totalFalha += 1;
      if (detalhesFalhas.length < 2) {
        detalhesFalhas.push(error?.message || 'Erro desconhecido');
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  if (totalSucesso === 0) {
    setDetalhesStatus('Não foi possível baixar os PDFs filtrados.', 'error');
    downloadMassaEmAndamento = false;
    atualizarBotaoDownloadEmMassa();
    return;
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);
  const linkZip = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  linkZip.href = zipUrl;
  linkZip.download = `PDFs-Projeto-${codigoProjeto}-${timestamp}.zip`;
  document.body.appendChild(linkZip);
  linkZip.click();
  linkZip.remove();
  setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

  if (totalFalha === 0) {
    setDetalhesStatus(`ZIP gerado com sucesso: ${totalSucesso} PDF(s).`, 'success');
  } else {
    const detalheFalha = detalhesFalhas.length ? ` Motivo: ${detalhesFalhas.join(' | ')}` : '';
    setDetalhesStatus(`ZIP gerado parcialmente: ${totalSucesso} PDF(s) incluído(s) e ${totalFalha} falha(s).${detalheFalha}`, 'error');
  }

  downloadMassaEmAndamento = false;
  atualizarBotaoDownloadEmMassa();
}

function preencherFiltroTipo(registros) {
  const tiposUnicos = [...new Set(registros
    .map((registro) => String(registro?.tipo_atestado || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  filtroTipoSelect.innerHTML = '<option value="">Todos os tipos</option>';
  tiposUnicos.forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo;
    option.textContent = tipo;
    filtroTipoSelect.appendChild(option);
  });
}

function aplicarFiltros() {
  const nomeFiltro = normalizarTexto(filtroNomeInput.value);
  const dataInicioFiltro = filtroDataInicioInput.value;
  const dataFimFiltro = filtroDataFimInput.value;
  const dataMinFiltro = dataInicioFiltro && dataFimFiltro && dataInicioFiltro > dataFimFiltro ? dataFimFiltro : dataInicioFiltro;
  const dataMaxFiltro = dataInicioFiltro && dataFimFiltro && dataInicioFiltro > dataFimFiltro ? dataInicioFiltro : dataFimFiltro;
  const tipoFiltro = filtroTipoSelect.value;

  const registrosFiltrados = registrosProjeto.filter((registro) => {
    const nomeRegistro = normalizarTexto(registro?.nome);
    const dataRegistro = obterDataISO(registro?.created);
    const tipoRegistro = String(registro?.tipo_atestado || '');

    const correspondeNome = !nomeFiltro || nomeRegistro.includes(nomeFiltro);
    const correspondeDataInicio = !dataMinFiltro || (dataRegistro && dataRegistro >= dataMinFiltro);
    const correspondeDataFim = !dataMaxFiltro || (dataRegistro && dataRegistro <= dataMaxFiltro);
    const correspondeData = correspondeDataInicio && correspondeDataFim;
    const correspondeTipo = !tipoFiltro || tipoRegistro === tipoFiltro;

    return correspondeNome && correspondeData && correspondeTipo;
  });

  registrosProjetoFiltrados = registrosFiltrados;
  atualizarBotaoDownloadEmMassa();

  detalhesContainer.innerHTML = '';

  if (!registrosFiltrados.length) {
    setDetalhesStatus('Nenhum registro encontrado com os filtros aplicados.', 'info');
    return;
  }

  registrosFiltrados.forEach((registro) => {
    detalhesContainer.appendChild(criarCardRegistro(registro));
  });

  setDetalhesStatus(`Mostrando ${registrosFiltrados.length} de ${registrosProjeto.length} registro(s).`, 'success');
}

function configurarEventosFiltros() {
  filtroNomeInput.addEventListener('input', aplicarFiltros);
  filtroDataInicioInput.addEventListener('change', aplicarFiltros);
  filtroDataFimInput.addEventListener('change', aplicarFiltros);
  filtroTipoSelect.addEventListener('change', aplicarFiltros);
  if (baixarFiltradosBtn) {
    baixarFiltradosBtn.addEventListener('click', baixarPdfsFiltrados);
  }
}


import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase-config.js';

async function carregarDetalhesProjeto() {
  const params = new URLSearchParams(window.location.search);
  const codigoProjeto = params.get('projeto') || '';

  if (!codigoProjeto) {
    setDetalhesStatus('Projeto não informado.', 'error');
    return;
  }

  projetoTitulo.textContent = `Projeto ${codigoProjeto}`;
  projetoDescricao.textContent = BASES_PROJETO[codigoProjeto] || 'Bases relacionadas ao projeto selecionado.';

  setDetalhesStatus('Carregando informações preenchidas...', 'info');

  try {
    const snapshot = await getDocs(collection(db, 'envios_atestados'));
    const todosRegistros = [];
    snapshot.forEach((docSnap) => {
      todosRegistros.push({ id: docSnap.id, ...docSnap.data() });
    });

    const padraoProjeto = new RegExp(`\\b${codigoProjeto}\\b`);
    const registrosFiltrados = todosRegistros.filter((registro) => {
      return padraoProjeto.test(String(registro?.projeto || ''));
    });

    registrosProjeto = registrosFiltrados;
    registrosProjetoFiltrados = registrosFiltrados;

    if (!registrosProjeto.length) {
      detalhesContainer.innerHTML = '';
      preencherFiltroTipo([]);
      atualizarBotaoDownloadEmMassa();
      setDetalhesStatus('Nenhuma informação encontrada para este projeto.', 'info');
      return;
    }

    preencherFiltroTipo(registrosProjeto);
    aplicarFiltros();
  } catch (error) {
    setDetalhesStatus(`Erro ao carregar informações: ${error?.message || 'Falha ao carregar dados do projeto.'}`, 'error');
  }
}


// Inicialização direta (sem PocketBase)
ativarDownloadComNome();
configurarEventosFiltros();
carregarDetalhesProjeto();
