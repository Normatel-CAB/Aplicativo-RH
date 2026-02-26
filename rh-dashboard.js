const listaStatus = document.getElementById('listaStatus');
const tabelaWrapper = document.getElementById('tabelaWrapper');
const tabelaBody = document.getElementById('atestadosBody');
const sairRhBtn = document.getElementById('sairRhBtn');
const gerenciarUsuariosBtn = document.getElementById('gerenciarUsuariosBtn');
const projetoCards = Array.from(document.querySelectorAll('.projeto-card'));

let pocketbaseClient;
let pocketbaseConfig;
let registrosCache = [];
let projetoSelecionado = '';

function setListaStatus(texto, tipo = 'info') {
  listaStatus.textContent = texto;
  listaStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    listaStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    listaStatus.classList.add('status-message--success');
  } else {
    listaStatus.classList.add('status-message--info');
  }
}

function usuarioAprovado(modeloUsuario) {
  return Boolean(modeloUsuario && modeloUsuario.emailVisibility === true);
}

function usuarioAdministrador(modeloUsuario) {
  const emailAtual = String(modeloUsuario?.email || '').trim().toLowerCase();
  const adminEmails = Array.isArray(window.POCKETBASE_CONFIG?.rhAdminEmails)
    ? window.POCKETBASE_CONFIG.rhAdminEmails.map((email) => String(email).trim().toLowerCase())
    : [];
  return Boolean(emailAtual && adminEmails.includes(emailAtual));
}

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

function montarLinkArquivo(record, nomeArquivo) {
  const nomeCollection = encodeURIComponent(pocketbaseConfig.collection);
  const idRecord = encodeURIComponent(record.id);
  const arquivo = encodeURIComponent(nomeArquivo);
  return `${pocketbaseConfig.baseUrl}/api/files/${nomeCollection}/${idRecord}/${arquivo}?download=1`;
}

async function baixarArquivoComNome(urlArquivo, nomeDownload) {
  const resposta = await fetch(urlArquivo, { credentials: 'include' });
  if (!resposta.ok) {
    throw new Error('Falha ao baixar arquivo.');
  }

  const blob = await resposta.blob();
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
      window.location.href = urlArquivo;
    }
  });
}

function criarLinhaRegistro(record) {
  const tr = document.createElement('tr');

  const arquivos = Array.isArray(record.arquivo_pdf)
    ? record.arquivo_pdf
    : typeof record.arquivo_pdf === 'string' && record.arquivo_pdf
      ? [record.arquivo_pdf]
      : [];

  const linksArquivos = arquivos.length
    ? arquivos
      .map((arquivo, indice) => {
        const nomeExibicao = montarNomePdfPorRegistro(record, indice, arquivos.length);
        return `<a class="download-pdf-link" href="${montarLinkArquivo(record, arquivo)}" download="${nomeExibicao}" data-download-name="${encodeURIComponent(nomeExibicao)}">${nomeExibicao}</a>`;
      })
      .join('<br>')
    : '-';

  tr.innerHTML = `
    <td>${record.nome || '-'}</td>
    <td>${record.funcao || '-'}</td>
    <td>${record.projeto || '-'}</td>
    <td>${record.tipo_atestado || '-'}</td>
    <td>${formatarData(record.data_inicio)}</td>
    <td>${formatarData(record.data_fim)}</td>
    <td>${record.dias || '-'}</td>
    <td>${formatarDataHora(record.created)}</td>
    <td>${linksArquivos}</td>
  `;

  return tr;
}

function atualizarEstadoAbasProjeto() {
  projetoCards.forEach((card) => {
    const ativo = card.dataset.projeto === projetoSelecionado;
    card.classList.toggle('active', ativo);
    card.setAttribute('aria-selected', ativo ? 'true' : 'false');
  });
}

function filtrarRegistrosPorProjeto(registros) {
  if (!projetoSelecionado) {
    return registros;
  }

  const padraoProjeto = new RegExp(`\\b${projetoSelecionado}\\b`);
  return registros.filter((registro) => padraoProjeto.test(String(registro?.projeto || '')));
}

function renderizarTabela(registros) {
  tabelaBody.innerHTML = '';

  if (!registros.length) {
    const sufixoProjeto = projetoSelecionado ? ` para Projeto - ${projetoSelecionado}` : '';
    setListaStatus(`Nenhum atestado/declaração encontrado${sufixoProjeto}.`, 'info');
    tabelaWrapper.classList.add('hidden');
    return;
  }

  registros.forEach((registro) => {
    tabelaBody.appendChild(criarLinhaRegistro(registro));
  });

  if (projetoSelecionado) {
    setListaStatus(`Total de registros do Projeto - ${projetoSelecionado}: ${registros.length}`, 'success');
  } else {
    setListaStatus(`Total de registros: ${registros.length}`, 'success');
  }

  tabelaWrapper.classList.remove('hidden');
}

function aplicarFiltroProjeto(codigoProjeto) {
  projetoSelecionado = codigoProjeto;
  atualizarEstadoAbasProjeto();
  renderizarTabela(filtrarRegistrosPorProjeto(registrosCache));
}

async function carregarAtestados() {
  setListaStatus('Selecione um projeto para abrir a aba com todas as informações preenchidas.', 'info');
  tabelaWrapper.classList.add('hidden');
}

if (projetoCards.length) {
  projetoCards.forEach((card) => {
    card.addEventListener('click', () => {
      const codigoProjeto = card.dataset.projeto || '';
      if (!codigoProjeto) {
        return;
      }

      const url = `rh-projeto.html?projeto=${encodeURIComponent(codigoProjeto)}`;
      window.location.href = url;
    });
  });
}

if (sairRhBtn) {
  sairRhBtn.addEventListener('click', () => {
    if (pocketbaseClient) {
      pocketbaseClient.authStore.clear();
    }
    window.location.href = 'index.html';
  });
}

if (gerenciarUsuariosBtn) {
  gerenciarUsuariosBtn.addEventListener('click', () => {
    window.location.href = 'rh-usuarios.html';
  });
}

(function init() {
  const ok = iniciarPocketBase();

  if (!ok) {
    setListaStatus('Configuração inválida do PocketBase.', 'error');
    return;
  }

  if (!pocketbaseClient.authStore.isValid) {
    setListaStatus('Sessão RH não encontrada. Faça login com Microsoft na tela inicial.', 'error');
    return;
  }

  if (!usuarioAprovado(pocketbaseClient.authStore.model)) {
    pocketbaseClient.authStore.clear();
    setListaStatus('Seu acesso RH está pendente de aprovação do administrador.', 'error');
    return;
  }

  if (gerenciarUsuariosBtn && usuarioAdministrador(pocketbaseClient.authStore.model)) {
    gerenciarUsuariosBtn.classList.remove('hidden');
  }

  ativarDownloadComNome();
  carregarAtestados();
})();
