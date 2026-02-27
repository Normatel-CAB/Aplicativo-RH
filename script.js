const form = document.getElementById('rh-form');
const tipoAtestado = document.getElementById('tipoAtestado');
const horasWrapper = document.getElementById('horasComparecimentoWrapper');
const horasInput = document.getElementById('horasComparecimento');
const dataInicio = document.getElementById('dataInicio');
const dataFim = document.getElementById('dataFim');
const dias = document.getElementById('dias');
const arquivos = document.getElementById('arquivos');
const mensagem = document.getElementById('mensagem');
const botaoEnviar = form.querySelector('button[type="submit"]');
const rhAccessBtn = document.getElementById('rhAccessBtn');
const rhAuthPanel = document.getElementById('rhAuthPanel');
const microsoftLoginBtn = document.getElementById('microsoftLoginBtn');
const rhAuthStatus = document.getElementById('rhAuthStatus');
const rhLogoutBtn = document.getElementById('rhLogoutBtn');




const MS_POR_DIA = 24 * 60 * 60 * 1000;
const TIMEOUT_UPLOAD_MS = 30000;
const RH_REDIRECT_PENDING_KEY = 'rh_redirect_pending';

function toUTCDate(dateString) {
  const [ano, mes, dia] = dateString.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function toInputDate(dateObj) {
  const ano = dateObj.getUTCFullYear();
  const mes = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function calcularDiasPorIntervalo() {
  if (!dataInicio.value || !dataFim.value) {
    return;
  }

  const inicio = toUTCDate(dataInicio.value);
  const fim = toUTCDate(dataFim.value);
  const diferenca = Math.floor((fim - inicio) / MS_POR_DIA) + 1;

  if (diferenca >= 1) {
    dias.value = String(diferenca);
    dataFim.setCustomValidity('');
  } else {
    dataFim.setCustomValidity('A data de fim deve ser igual ou maior que a data de início.');
  }
}

function calcularFimPorDias() {
  if (!dataInicio.value || !dias.value) {
    return;
  }

  const totalDias = Number(dias.value);
  if (!Number.isInteger(totalDias) || totalDias < 1) {
    return;
  }

  const inicio = toUTCDate(dataInicio.value);
  const fim = new Date(inicio.getTime() + (totalDias - 1) * MS_POR_DIA);
  dataFim.value = toInputDate(fim);
  dataFim.setCustomValidity('');
}

function atualizarCampoHoras() {
  const isDeclaracao = tipoAtestado.value === 'Declaração';
  horasWrapper.classList.toggle('hidden', !isDeclaracao);
  horasInput.required = isDeclaracao;

  if (!isDeclaracao) {
    horasInput.value = '';
  }
}

function nomePdf(nomeOriginal) {
  const semExtensao = nomeOriginal.replace(/\.[^/.]+$/, '');
  return `${semExtensao}.pdf`;
}

function formatarDataCurtaParaNome(dataISO) {
  if (!dataISO || typeof dataISO !== 'string') {
    return '00.00.00';
  }

  const [ano, mes, dia] = dataISO.split('-');
  const anoCurto = (ano || '').slice(-2);
  return `${dia || '00'}.${mes || '00'}.${anoCurto || '00'}`;
}

function normalizarNomePessoaParaArquivo(nomePessoa) {
  return String(nomePessoa || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function sanitizarNomeArquivo(nomeArquivo) {
  return nomeArquivo
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function montarNomePdfPadrao() {
  const nomePessoa = normalizarNomePessoaParaArquivo(document.getElementById('nome').value);
  const dataInicioCurta = formatarDataCurtaParaNome(dataInicio.value);

  if (tipoAtestado.value === 'Declaração') {
    return sanitizarNomeArquivo(`DECLARAÇÃO MÉDICA - ${dataInicioCurta} - ${nomePessoa}.pdf`);
  }

  const totalDias = Number(dias.value) || 0;
  const labelDias = totalDias === 1 ? 'DIA' : 'DIAS';
  return sanitizarNomeArquivo(`ATESTADO MÉDICO - ${dataInicioCurta} (${totalDias} ${labelDias}) - ${nomePessoa}.pdf`);
}

function criarIdUnico() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function definirEstadoEnvio(carregando, textoBotao = 'Enviar') {
  botaoEnviar.disabled = carregando;
  botaoEnviar.textContent = carregando ? 'Enviando...' : textoBotao;
}

function definirMensagemStatus(texto, tipo = 'info') {
  if (!mensagem) {
    return;
  }

  mensagem.textContent = texto;
  mensagem.style.color = '';
  mensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');

  if (tipo === 'error') {
    mensagem.classList.add('status-message--error');
  } else if (tipo === 'success') {
    mensagem.classList.add('status-message--success');
  } else {
    mensagem.classList.add('status-message--info');
  }
}

function estaAutenticado() {
  return Boolean(pocketbaseClient && pocketbaseClient.authStore && pocketbaseClient.authStore.isValid);
}

function nomeUsuarioAutenticado() {
  const model = pocketbaseClient?.authStore?.model;
  return model?.name || model?.email || 'Conta Microsoft conectada';
}

function atualizarEstadoAuthUI() {
  if (!rhAuthStatus || !microsoftLoginBtn || !rhLogoutBtn) {
    return;
  }

  if (estaAutenticado()) {
    rhAuthStatus.textContent = `Conectado: ${nomeUsuarioAutenticado()}`;
    microsoftLoginBtn.classList.add('hidden');
    rhLogoutBtn.classList.remove('hidden');
  } else {
    rhAuthStatus.textContent = 'Não autenticado.';
    microsoftLoginBtn.classList.remove('hidden');
    rhLogoutBtn.classList.add('hidden');
  }
}

function irParaPainelRh() {
  sessionStorage.removeItem(RH_REDIRECT_PENDING_KEY);
  window.location.href = 'rh-atestados.html';
}

function extrairDetalheErroAuth(error) {
  const resposta = error?.response;
  const possiveisDetalhes = [
    resposta?.message,
    resposta?.data?.message,
    resposta?.data?.error,
    error?.message
  ];

  for (const detalhe of possiveisDetalhes) {
    if (typeof detalhe === 'string' && detalhe.trim()) {
      return detalhe.trim();
    }
  }

  return 'Erro desconhecido de autenticação OAuth.';
}

function abrirPopupOAuth(url) {
  const largura = Math.min(1024, window.innerWidth || 1024);
  const altura = Math.min(768, window.innerHeight || 768);
  const esquerda = Math.max(0, Math.round(((window.innerWidth || largura) - largura) / 2));
  const topo = Math.max(0, Math.round(((window.innerHeight || altura) - altura) / 2));

  const popup = window.open(
    url,
    'pb_oauth2_manual',
    `width=${largura},height=${altura},left=${esquerda},top=${topo},resizable,menubar=no`
  );

  if (!popup) {
    throw new Error('Popup bloqueado pelo navegador.');
  }
}

function inicializarPocketBase() {
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
    collection: config.collection,
    fileField: config.fileField || 'arquivo_pdf',
    authCollection: config.authCollection || 'users',
    authProvider: config.authProvider || 'microsoft'
  };

  if (!pocketbaseClient) {
    pocketbaseClient = new window.PocketBase(pocketbaseConfig.baseUrl);
    pocketbaseClient.autoCancellation(false);

    pocketbaseClient.authStore.onChange(() => {
      const deveRedirecionar = sessionStorage.getItem(RH_REDIRECT_PENDING_KEY) === '1';
      if (deveRedirecionar && estaAutenticado()) {
        irParaPainelRh();
      }
    });
  }

  return true;
}

function montarEndpointPocketBase() {
  return `${pocketbaseConfig.baseUrl}/api/collections/${pocketbaseConfig.collection}/records`;
}

function blobParaArquivoPdf(blob, nomeArquivo) {
  return new File([blob], nomeArquivo, { type: 'application/pdf' });
}

async function converterImagemParaPdf(arquivo) {
  const { jsPDF } = window.jspdf;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(arquivo);
  });

  const imagem = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem inválida para conversão.'));
    img.src = dataUrl;
  });

  const orientacao = imagem.width > imagem.height ? 'l' : 'p';
  const pdf = new jsPDF({ orientation: orientacao, unit: 'pt', format: 'a4' });
  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();

  const escala = Math.min(larguraPagina / imagem.width, alturaPagina / imagem.height);
  const larguraFinal = imagem.width * escala;
  const alturaFinal = imagem.height * escala;
  const x = (larguraPagina - larguraFinal) / 2;
  const y = (alturaPagina - alturaFinal) / 2;

  const formatoImagem = arquivo.type.includes('png') ? 'PNG' : 'JPEG';
  pdf.addImage(dataUrl, formatoImagem, x, y, larguraFinal, alturaFinal);
  return pdf.output('blob');
}

async function converterTxtParaPdf(arquivo) {
  const { jsPDF } = window.jspdf;
  const texto = await arquivo.text();
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margem = 40;
  const largura = pdf.internal.pageSize.getWidth() - margem * 2;
  const linhas = pdf.splitTextToSize(texto || ' ', largura);
  let y = 52;

  linhas.forEach((linha) => {
    if (y > pdf.internal.pageSize.getHeight() - 40) {
      pdf.addPage();
      y = 52;
    }
    pdf.text(linha, margem, y);
    y += 18;
  });

  return pdf.output('blob');
}

async function converterArquivoParaPdf(arquivo) {
  if (arquivo.type === 'application/pdf') {
    return { blob: arquivo, nome: nomePdf(arquivo.name) };
  }

  if (arquivo.type.startsWith('image/')) {
    const blob = await converterImagemParaPdf(arquivo);
    return { blob, nome: nomePdf(arquivo.name) };
  }

  if (arquivo.type === 'text/plain') {
    const blob = await converterTxtParaPdf(arquivo);
    return { blob, nome: nomePdf(arquivo.name) };
  }

  return null;
}

function montarFormDataEnvio(arquivosConvertidos) {
  const formData = new FormData();
  formData.append('nome', document.getElementById('nome').value.trim());
  formData.append('funcao', document.getElementById('funcao').value.trim());
  formData.append('projeto', document.getElementById('projeto').value);
  formData.append('tipo_atestado', tipoAtestado.value);
  formData.append('horas_comparecimento', horasInput.value ? String(Number(horasInput.value)) : '');
  formData.append('data_inicio', dataInicio.value);
  formData.append('data_fim', dataFim.value);
  formData.append('dias', String(Number(dias.value)));

  const nomePdfPadrao = montarNomePdfPadrao();
  arquivosConvertidos.forEach((arquivoConvertido, indice) => {
    const nomeArquivo = arquivosConvertidos.length > 1
      ? nomePdfPadrao.replace('.pdf', ` - ANEXO ${indice + 1}.pdf`)
      : nomePdfPadrao;
    const arquivoPdf = blobParaArquivoPdf(arquivoConvertido.blob, nomeArquivo);
    formData.append('arquivos', arquivoPdf, nomeArquivo);
  });
  return formData;
}

tipoAtestado.addEventListener('change', atualizarCampoHoras);
dataInicio.addEventListener('change', () => {
  calcularDiasPorIntervalo();
  calcularFimPorDias();
});
dataFim.addEventListener('change', calcularDiasPorIntervalo);
dias.addEventListener('input', calcularFimPorDias);

if (rhAccessBtn) {
  rhAccessBtn.addEventListener('click', () => {
    window.location.href = 'rh-login.html';
  });
}

if (microsoftLoginBtn) {
  microsoftLoginBtn.addEventListener('click', async () => {
    const ok = inicializarPocketBase();
    if (!ok) {
      definirMensagemStatus('Configuração inválida do PocketBase para login Microsoft.', 'error');
      return;
    }

    microsoftLoginBtn.disabled = true;
    sessionStorage.setItem(RH_REDIRECT_PENDING_KEY, '1');
    definirMensagemStatus('Iniciando login Microsoft...', 'info');

    try {
      const authMethods = await pocketbaseClient.collection(pocketbaseConfig.authCollection).listAuthMethods();
      const oauthEnabled = Boolean(authMethods?.oauth2?.enabled);
      const providersOauth2 = Array.isArray(authMethods?.oauth2?.providers) ? authMethods.oauth2.providers : [];
      const providersLegado = Array.isArray(authMethods?.authProviders) ? authMethods.authProviders : [];
      const providers = [...providersOauth2, ...providersLegado];
      const providerOk = providers.some((provider) => provider?.name === pocketbaseConfig.authProvider);

      if (!oauthEnabled || !providerOk) {
        definirMensagemStatus('Ative OAuth2 Microsoft na coleção users (Auth methods) no PocketBase Admin.', 'error');
        microsoftLoginBtn.disabled = false;
        return;
      }

      await pocketbaseClient.collection(pocketbaseConfig.authCollection).authWithOAuth2({
        provider: pocketbaseConfig.authProvider,
        urlCallback: (url) => {
          abrirPopupOAuth(url);
        }
      });
      atualizarEstadoAuthUI();
      definirMensagemStatus('Login Microsoft realizado com sucesso.', 'success');
      irParaPainelRh();
    } catch (error) {
      if (estaAutenticado()) {
        atualizarEstadoAuthUI();
        definirMensagemStatus('Login Microsoft realizado com sucesso.', 'success');
        irParaPainelRh();
        return;
      }

      sessionStorage.removeItem(RH_REDIRECT_PENDING_KEY);

      const detalheErro = extrairDetalheErroAuth(error).toLowerCase();

      if (detalheErro.includes('popup') || detalheErro.includes('window')) {
        mensagem.textContent = 'Login bloqueado por popup. Permita popups para este site e tente novamente.';
      } else if (detalheErro.includes('aadsts90002') || detalheErro.includes('tenant') && detalheErro.includes('not found')) {
        mensagem.textContent = 'Tenant do Microsoft Entra inválido ou não encontrado. Ajuste o provider OAuth no PocketBase.';
      } else if (detalheErro.includes('aadsts53003') || detalheErro.includes('conditional access') || detalheErro.includes('access has been blocked by conditional access policies')) {
        mensagem.textContent = 'Login bloqueado pela política de Acesso Condicional da Microsoft. Solicite liberação ao administrador do Entra ID.';
      } else if (detalheErro.includes('invalid_client') || detalheErro.includes('aadsts7000215')) {
        mensagem.textContent = 'Client Secret inválido no provider Microsoft do PocketBase.';
      } else if (detalheErro.includes('redirect_uri') || detalheErro.includes('aadsts50011')) {
        mensagem.textContent = 'Redirect URI inválida no Microsoft Entra. Use http://localhost:5500/rh-oauth-callback.html.';
      } else {
        mensagem.textContent = `Não foi possível concluir o login Microsoft: ${extrairDetalheErroAuth(error)}`;
      }
      definirMensagemStatus(mensagem.textContent, 'error');
    } finally {
      microsoftLoginBtn.disabled = false;
    }
  });
}

if (rhLogoutBtn) {
  rhLogoutBtn.addEventListener('click', () => {
    if (pocketbaseClient) {
      pocketbaseClient.authStore.clear();
    }
    atualizarEstadoAuthUI();
    definirMensagemStatus('Sessão encerrada.', 'success');
  });
}




form.addEventListener('submit', async (event) => {
  event.preventDefault();
  definirEstadoEnvio(true);

  if (!form.checkValidity()) {
    form.reportValidity();
    definirMensagemStatus('Revise os campos obrigatórios antes de enviar.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  if (!window.jspdf) {
    definirMensagemStatus('Não foi possível carregar a biblioteca de PDF.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  const listaArquivos = Array.from(arquivos.files || []);
  if (!listaArquivos.length) {
    definirMensagemStatus('Selecione ao menos um arquivo para converter.', 'error');
    definirEstadoEnvio(false);
    return;
  }

  definirMensagemStatus('Convertendo e enviando arquivo(s)...', 'info');

  try {
    const convertidos = [];
    const naoSuportados = [];

    for (const arquivo of listaArquivos) {
      const convertido = await converterArquivoParaPdf(arquivo);
      if (convertido) {
        convertidos.push(convertido);
      } else {
        naoSuportados.push(arquivo.name);
      }
    }

    if (naoSuportados.length) {
      definirMensagemStatus(`Formato não suportado para conversão automática: ${naoSuportados.join(', ')}.`, 'error');
      definirEstadoEnvio(false);
      return;
    }

    // Envio para backend Node.js
    const formData = montarFormDataEnvio(convertidos);
    const resp = await fetch('http://localhost:3001/api/envios', {
      method: 'POST',
      body: formData
    });
    if (!resp.ok) {
      const erro = await resp.text().catch(() => '');
      throw new Error(erro || 'Erro ao enviar atestado.');
    }
    window.location.href = 'sucesso.html';
  } catch (error) {
    definirMensagemStatus(error?.message || 'Erro ao enviar atestado.', 'error');
    definirEstadoEnvio(false);
  }
});

atualizarCampoHoras();
