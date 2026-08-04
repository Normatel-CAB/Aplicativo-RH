const MS_PER_DAY = 24 * 60 * 60 * 1000;

function $(selector) {
  return document.querySelector(selector);
}

function setStatus(message, type = 'info') {
  const status = $('#mensagem');
  if (!status) return;
  status.textContent = message;
  status.className = `status-message status-message--${type}`;
}

function setLoading(isLoading) {
  const submitBtn = $('#rh-form button[type="submit"]');
  if (submitBtn) submitBtn.disabled = isLoading;
  const progressWrapper = $('#uploadProgressWrapper');
  if (progressWrapper) {
    progressWrapper.classList.toggle('hidden', !isLoading);
  }
}

function showModal() {
  const modal = $('#modalAvisoAtestado');
  if (modal) modal.classList.add('modal-aberto');
  document.body.classList.add('modal-open');
}

function hideModal() {
  const modal = $('#modalAvisoAtestado');
  if (modal) modal.classList.remove('modal-aberto');
  document.body.classList.remove('modal-open');
}

function parseDateBr(value) {
  const parts = String(value).trim().split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((part) => Number(part));
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  const date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISOStringDate(value) {
  const date = parseDateBr(value);
  if (!date) return null;
  // Data PURA (YYYY-MM-DD), sem hora/UTC — mesmo formato dos atestados antigos.
  // Usa componentes locais para não deslocar o dia na conversão para UTC.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateBr(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function maskDateBr(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 4) v = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
  else if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
  input.value = v;
}

function initDatePicker(textInput, onPick) {
  if (!textInput) return;
  const native = document.createElement('input');
  native.type = 'date';
  native.setAttribute('aria-hidden', 'true');
  native.tabIndex = -1;
  native.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '📅';
  btn.setAttribute('aria-label', 'Abrir calendário');
  btn.style.cssText = 'margin-left:6px;cursor:pointer;background:none;border:none;font-size:1.1rem;';
  textInput.insertAdjacentElement('afterend', btn);
  btn.insertAdjacentElement('afterend', native);
  btn.addEventListener('click', () => {
    const d = parseDateBr(textInput.value);
    if (d) native.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (typeof native.showPicker === 'function') native.showPicker();
    else native.focus();
  });
  native.addEventListener('change', () => {
    if (!native.value) return;
    const [y, m, d] = native.value.split('-').map(Number);
    textInput.value = formatDateBr(new Date(y, m - 1, d));
    onPick?.();
  });
}

function updateEndFromDays() {
  const dataInicio = $('#dataInicio');
  const dataFim = $('#dataFim');
  const dias = $('#dias');
  if (!dataInicio || !dataFim || !dias) return;
  const inicio = parseDateBr(dataInicio.value);
  const qtd = Number(dias.value);
  if (inicio && Number.isInteger(qtd) && qtd > 0) {
    const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + qtd - 1);
    fim.setHours(0, 0, 0, 0);
    dataFim.value = formatDateBr(fim);
  } else {
    dataFim.value = '';
  }
}

function preselectProjeto() {
  const select = $('#projeto');
  if (!select) return;
  const isRh = String(localStorage.getItem('rh_user_email') || '').trim() !== '';
  const fromQuery = new URLSearchParams(window.location.search).get('projeto');
  const valor = normalizeProject(fromQuery || localStorage.getItem('rh_projeto_preselecionado'));
  if (valor && !Array.from(select.options).some((o) => o.value === valor)) {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = valor;
    select.appendChild(opt);
  }
  if (valor) {
    select.value = valor;
    // Colaborador (sem login): projeto fixo e bloqueado. RH pode trocar.
    if (!isRh) {
      lockProjeto(select, valor);
    }
  }
}

function lockProjeto(select, valor) {
  const label = select.closest('label');
  select.setAttribute('disabled', 'disabled');
  select.setAttribute('aria-readonly', 'true');
  // hidden field garante envio do valor (select disabled não submete).
  if (!$('#projetoHidden')) {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'projetoHidden';
    hidden.name = 'projeto';
    hidden.value = valor;
    select.insertAdjacentElement('afterend', hidden);
  }
  if (label) label.classList.add('projeto-destaque');
}

function normalizeProject(value) {
  return String(value || '').trim();
}

function updateSpecialFields() {
  const tipoSelect = $('#tipoAtestado');
  const grauGroup = $('#grauParentescoWrapper');
  const trabalhoHoras = $('#horasComparecimentoWrapper');
  const diasWrapper = $('#diasWrapper');
  const dias = $('#dias');
  const dataInicio = $('#dataInicio');
  const dataFim = $('#dataFim');
  const dataFimLabel = dataFim?.closest('label');
  const tipo = tipoSelect?.value;
  if (tipo === 'Atestado de Óbito') {
    grauGroup?.classList.remove('hidden');
  } else {
    grauGroup?.classList.add('hidden');
  }
  if (tipo === 'Odontológico') {
    trabalhoHoras?.classList.remove('hidden');
    $('#horasComparecimento')?.setAttribute('required', 'required');
  } else if (tipo === 'Declaração' || tipo === 'Declaração de Comparecimento') {
    trabalhoHoras?.classList.remove('hidden');
    $('#horasComparecimento')?.setAttribute('required', 'required');
  } else {
    trabalhoHoras?.classList.add('hidden');
    $('#horasComparecimento')?.removeAttribute('required');
  }
  const dataInicioLabel = dataInicio?.closest('label');
  const renameDataInicio = (texto) => {
    const node = Array.from(dataInicioLabel?.childNodes || []).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (node) node.textContent = texto;
  };

  if (isDeclaracao(tipo)) {
    // Declaração: só Data Inicial. Esconde Dias e Data Fim e remove obrigatoriedade.
    diasWrapper?.classList.add('hidden');
    dataFimLabel?.classList.add('hidden');
    dias?.removeAttribute('required');
    dataFim?.removeAttribute('required');
    // Espelha valor para manter backend consistente (data_fim = data_inicio).
    if (dataInicio?.value && dataFim) dataFim.value = dataInicio.value;
    renameDataInicio('Data');
  } else {
    diasWrapper?.classList.remove('hidden');
    dataFimLabel?.classList.remove('hidden');
    dias?.setAttribute('required', 'required');
    dataFim?.setAttribute('required', 'required');
    renameDataInicio('Data de início');
    updateEndFromDays();
  }
}

function updateDaysFromDates() {
  const dataInicio = $('#dataInicio');
  const dataFim = $('#dataFim');
  const dias = $('#dias');
  if (!dataInicio || !dataFim || !dias) return;
  const inicio = parseDateBr(dataInicio.value);
  const fim = parseDateBr(dataFim.value);
  if (inicio && fim) {
    const utcInicio = Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const utcFim = Date.UTC(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const diff = Math.floor((utcFim - utcInicio) / MS_PER_DAY) + 1;
    if (diff > 0) {
      dias.value = String(diff);
    }
  }
}

function isDeclaracao(tipo) {
  return tipo === 'Declaração' || tipo === 'Declaração de Comparecimento';
}

function validateDates() {
  const dataInicio = $('#dataInicio');
  const dataFim = $('#dataFim');
  if (!dataInicio) return false;
  const tipo = $('#tipoAtestado')?.value;
  const start = parseDateBr(dataInicio.value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Data Inicial: obrigatória, válida e nunca futura (para todos os tipos).
  if (!start) {
    setStatus('Data de início inválida. Use DD/MM/AAAA.', 'error');
    return false;
  }
  if (start > today) {
    setStatus('A data de início não pode ser futura.', 'error');
    return false;
  }

  // Declaração: apenas Data Inicial é exigida. Data Fim não é validada.
  if (isDeclaracao(tipo)) {
    return true;
  }

  // Demais tipos: Data Fim obrigatória, válida e não anterior ao início.
  // Data Fim pode ser futura (permitido por requisito).
  const end = parseDateBr(dataFim?.value);
  if (!end) {
    setStatus('Data de fim inválida. Use DD/MM/AAAA.', 'error');
    return false;
  }
  if (end < start) {
    setStatus('A data de fim não pode ser anterior à data de início.', 'error');
    return false;
  }
  return true;
}

async function uploadFiles(files, envioId, record = {}) {
  if (!window.storage || typeof window.storage.ref !== 'function') {
    throw new Error('Firebase Storage não disponível nesta página. O upload não é possível.');
  }

  const totalBytes = Array.from(files).reduce((sum, file) => sum + file.size, 0);
  let progressBytes = 0;

  const uploads = Array.from(files).map((file, index) => {
    const extensao = file.name && file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
    const nomePadrao = typeof window.montarNomeArquivoAtestado === 'function'
      ? window.montarNomeArquivoAtestado(record, extensao, index, files.length)
      : `${Date.now()}-${index + 1}-${file.name}`;
    const nomeArquivo = typeof window.normalizarNomeArquivoStorage === 'function'
      ? window.normalizarNomeArquivoStorage(nomePadrao, index)
      : nomePadrao;
    const caminho = `envios/${envioId}/${nomeArquivo}`;
    const storageRef = window.storage.ref(caminho);
    return new Promise((resolve, reject) => {
      const task = storageRef.put(file);
      task.on('state_changed', (snapshot) => {
        if (!snapshot || !snapshot.totalBytes) return;
        progressBytes += snapshot.bytesTransferred - (task.lastBytesTransferred || 0);
        task.lastBytesTransferred = snapshot.bytesTransferred;
        const progresso = Math.min(100, Math.round((progressBytes / totalBytes) * 100));
        updateProgress(progresso, `${progresso}%`);
      }, reject, () => {
        try {
          const metadata = task.snapshot.metadata || {};
          const token = metadata.downloadTokens
            ? String(metadata.downloadTokens).split(',')[0]
            : '';
          const bucket = metadata.bucket || firebaseConfig.storageBucket;
          const url = token
            ? `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(caminho)}?alt=media&token=${token}`
            : '';
          resolve({ nome: nomeArquivo, caminho, tipo: file.type || 'application/pdf', url });
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  return Promise.all(uploads);
}

function updateProgress(value, text) {
  const progressBar = $('#uploadProgressBar');
  const progressText = $('#uploadProgressText');
  const progressLabel = $('#uploadProgressLabel');
  if (progressBar) progressBar.value = value;
  if (progressText) progressText.textContent = text;
  if (progressLabel) progressLabel.textContent = `Enviando: ${text}`;
}

function resetProgress() {
  updateProgress(0, '0%');
  const progressWrapper = $('#uploadProgressWrapper');
  if (progressWrapper) progressWrapper.classList.add('hidden');
}

function safeFetchJson(url, options) {
  return fetch(url, options).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || response.statusText || 'Erro na requisição';
      throw new Error(message);
    }
    return response.json().catch(() => ({}));
  });
}

// Backend remoto (Cloud Run). O servidor local :3001 foi removido de propósito;
// não usar fallback para localhost. Permite override via window.__RH_BACKEND_URL__.
const DEFAULT_REMOTE_BACKEND_URL = 'https://api-vgqcbmomea-rj.a.run.app';
function getBackendBase() {
  if (window.__RH_BACKEND_URL__) {
    return String(window.__RH_BACKEND_URL__).trim().replace(/\/+$/, '');
  }
  return DEFAULT_REMOTE_BACKEND_URL;
}

async function registrarEventoBackend(acao, detalhes = {}) {
  const backendBase = getBackendBase();
  try {
    await safeFetchJson(`${backendBase}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, detalhes, evento: 'frontend' })
    });
  } catch (err) {
    console.warn('Falha ao registrar evento no backend:', err.message);
  }
}

function getSuccessRedirectUrl() {
  // sucesso.html fica na mesma pasta (frontend/pages/), igual às demais páginas.
  return 'sucesso.html';
}

function openFilePreview() {
  const preview = $('#filePreviewArea');
  const files = $('#arquivos')?.files;
  if (!preview || !files || !files.length) {
    preview?.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  preview.classList.remove('hidden');
  preview.innerHTML = Array.from(files).map((file) => `<div class="file-preview-item">${file.name}</div>`).join('');
}

function initAttachmentHandlers() {
  const arquivosInput = $('#arquivos');
  if (!arquivosInput) return;
  arquivosInput.addEventListener('change', openFilePreview);
}

function initModal() {
  const checkbox = $('#modalAvisoConfirmarCheck');
  const continueButton = $('#modalAvisoContinuar');
  const cancelButton = $('#modalAvisoCancelar');
  let avisoAtestadoConfirmado = false;

  if (checkbox) {
    checkbox.addEventListener('change', () => {
      avisoAtestadoConfirmado = checkbox.checked;
      if (continueButton) continueButton.disabled = !avisoAtestadoConfirmado;
    });
  }

  if (continueButton) {
    continueButton.addEventListener('click', () => {
      if (avisoAtestadoConfirmado) {
        hideModal();
      }
    });
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      hideModal();
    });
  }

  return () => avisoAtestadoConfirmado;
}

let avisoConfirmadoNesteAcesso = false;

function getModalState() {
  return avisoConfirmadoNesteAcesso === true;
}

function setModalState(value) {
  avisoConfirmadoNesteAcesso = value === true;
  const checkbox = $('#modalAvisoConfirmarCheck');
  if (checkbox) checkbox.checked = value === true;
}

function showWarningModal() {
  setModalState(false);
  showModal();
}

function setFormBlocked(isBlocked) {
  const form = $('#rh-form');
  if (!form) return;
  form.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (el.closest('#modalAvisoAtestado')) return;
    if (el.type === 'hidden') return;
    if (el.tagName === 'BUTTON' && el.type === 'button') return;
    el.disabled = isBlocked;
  });
}

async function initForm() {
  const form = $('#rh-form');
  const tipoAtestado = $('#tipoAtestado');
  const dataInicio = $('#dataInicio');
  const dataFim = $('#dataFim');
  const dias = $('#dias');
  const projetoSelect = $('#projeto');
  const grauParentesco = $('#grauParentesco');
  const horasComparecimento = $('#horasComparecimento');
  const modalCheckbox = $('#modalAvisoConfirmarCheck');
  const modalContinueButton = $('#modalAvisoContinuar');

  if (!form) return;
  if (modalCheckbox) {
    modalCheckbox.addEventListener('change', () => {
      setModalState(modalCheckbox.checked);
      if (modalContinueButton) modalContinueButton.disabled = !modalCheckbox.checked;
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!getModalState()) {
      setStatus('Confirme o aviso antes de enviar o atestado.', 'error');
      showWarningModal();
      return;
    }

    setStatus('', 'info');
    setLoading(true);
    resetProgress();

    const nome = $('#nome');
    const email = $('#email');
    const funcao = $('#funcao');
    const arquivosInput = $('#arquivos');

    if (!nome?.value.trim() || !email?.value.trim() || !funcao?.value.trim()) {
      setStatus('Preencha nome, email e função.', 'error');
      setLoading(false);
      return;
    }

    if (!projetoSelect?.value) {
      setStatus('Selecione um projeto.', 'error');
      setLoading(false);
      return;
    }

    if (!tipoAtestado?.value) {
      setStatus('Selecione o tipo de atestado.', 'error');
      setLoading(false);
      return;
    }

    if (!validateDates()) {
      setLoading(false);
      return;
    }

    if (!arquivosInput?.files?.length) {
      setStatus('Selecione pelo menos um arquivo para enviar.', 'error');
      setLoading(false);
      return;
    }

    const tipo = tipoAtestado.value;
    if (tipo === 'Atestado de Óbito' && !grauParentesco?.value) {
      setStatus('Selecione o grau de parentesco para atestado de óbito.', 'error');
      setLoading(false);
      return;
    }

    let dataFimValue = dataFim.value;
    if (tipo === 'Declaração') {
      dataFimValue = dataInicio.value;
      dataFim.value = dataInicio.value;
      dias.value = '1';
    }

    if (!normalizeProject(projetoSelect.value)) {
      setStatus('Selecione o projeto antes de enviar o formulário.', 'error');
      setLoading(false);
      return;
    }

    const envioId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const uploadRecord = {
      nome: nome.value.trim(),
      tipo_atestado: tipo,
      dias: Number(dias.value) || 0,
      data_inicio: toISOStringDate(dataInicio.value),
      grau_parentesco: tipo === 'Atestado de Óbito' ? grauParentesco?.value : null,
    };

    let arquivosUpload = [];
    try {
      arquivosUpload = await uploadFiles(arquivosInput.files, envioId, uploadRecord);
    } catch (err) {
      setStatus(`Erro de upload de arquivos: ${err.message}`, 'error');
      setLoading(false);
      return;
    }

    const novoEnvio = {
      nome: nome.value.trim(),
      email: email.value.trim(),
      funcao: funcao.value.trim(),
      projeto: projetoSelect.value,
      tipo_atestado: tipo,
      horas_comparecimento: horasComparecimento?.value ? String(Number(horasComparecimento.value)) : '',
      data_inicio: toISOStringDate(dataInicio.value),
      data_fim: toISOStringDate(dataFimValue),
      grau_parentesco: tipo === 'Atestado de Óbito' ? grauParentesco?.value : null,
      dias: Number(dias.value) || undefined,
      arquivos: arquivosUpload,
      criado_em: new Date().toISOString(),
      tracking_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    };

    const backendBase = getBackendBase();

    try {
      await safeFetchJson(`${backendBase}/api/envios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoEnvio)
      });
    } catch (err) {
      setStatus(`Falha ao salvar metadados: ${err.message}`, 'error');
      setLoading(false);
      return;
    }

    try {
      await safeFetchJson(`${backendBase}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoEnvio)
      });
    } catch (err) {
      console.warn('Falha ao notificar email:', err.message);
    }

    await registrarEventoBackend('envio_realizado', { projeto: novoEnvio.projeto, tipo_atestado: novoEnvio.tipo_atestado, tracking_id: novoEnvio.tracking_id });
    sessionStorage.setItem('envio_success_data', JSON.stringify({ tracking_id: novoEnvio.tracking_id, nome: novoEnvio.nome, email: novoEnvio.email, criado_em: novoEnvio.criado_em }));
    window.location.href = getSuccessRedirectUrl();
  });

  const diasWrapper = $('#diasWrapper');
  const dataFimWrapper = dataFim?.closest('label');
  const dataInicioLabel = dataInicio?.closest('label');

  if (tipoAtestado) {
    tipoAtestado.addEventListener('change', () => {
      updateSpecialFields();
    });
  }

  if (dataInicio) {
    dataInicio.addEventListener('input', () => maskDateBr(dataInicio));
    dataInicio.addEventListener('input', updateEndFromDays);
    dataInicio.addEventListener('change', updateEndFromDays);
    initDatePicker(dataInicio, updateEndFromDays);
  }
  if (dias) {
    dias.addEventListener('input', updateEndFromDays);
    dias.addEventListener('change', updateEndFromDays);
  }

  updateSpecialFields();
  preselectProjeto();
  setFormBlocked(true);
  showWarningModal();

  if ($('#modalAvisoConfirmarCheck')) {
    $('#modalAvisoConfirmarCheck').addEventListener('change', () => {
      if ($('#modalAvisoContinuar')) {
        $('#modalAvisoContinuar').disabled = !$('#modalAvisoConfirmarCheck').checked;
      }
      setModalState($('#modalAvisoConfirmarCheck').checked);
    });
  }

  $('#rhAccessBtn')?.addEventListener('click', () => {
    window.location.href = 'rh-login.html';
  });

  $('#modalAvisoContinuar')?.addEventListener('click', () => {
    if (getModalState()) {
      hideModal();
      setFormBlocked(false);
    }
  });
  $('#modalAvisoCancelar')?.addEventListener('click', () => {
    hideModal();
    setFormBlocked(true);
  });
  $('#formBackToIndexBtn')?.addEventListener('click', () => {
    setStatus('', 'info');
  });

  initAttachmentHandlers();
  updateSpecialFields();
}

document.addEventListener('DOMContentLoaded', initForm);