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
  if (modal) modal.classList.add('modal-overlay--visible');
}

function hideModal() {
  const modal = $('#modalAvisoAtestado');
  if (modal) modal.classList.remove('modal-overlay--visible');
}

function parseDateBr(value) {
  const parts = String(value).trim().split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map((part) => Number(part));
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) return null;
  return date;
}

function toISOStringDate(value) {
  const date = parseDateBr(value);
  return date ? date.toISOString() : null;
}

function normalizeProject(value) {
  return String(value || '').trim();
}

function updateSpecialFields() {
  const tipoSelect = $('#tipoAtestado');
  const grauGroup = $('#grauParentescoWrapper');
  const trabalhoHoras = $('#horasComparecimentoWrapper');
  const tipo = tipoSelect?.value;
  if (tipo === 'Atestado de Óbito') {
    grauGroup?.classList.remove('hidden');
  } else {
    grauGroup?.classList.add('hidden');
  }
  if (tipo === 'Odontológico') {
    trabalhoHoras?.classList.remove('hidden');
  } else {
    trabalhoHoras?.classList.add('hidden');
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
    const diff = Math.floor((fim - inicio) / MS_PER_DAY) + 1;
    if (diff > 0) {
      dias.value = String(diff);
    }
  }
}

function validateDates() {
  const dataInicio = $('#dataInicio');
  const dataFim = $('#dataFim');
  if (!dataInicio || !dataFim) return false;
  const start = parseDateBr(dataInicio.value);
  const end = parseDateBr(dataFim.value);
  if (!start) {
    setStatus('Data de início inválida. Use DD/MM/AAAA.', 'error');
    return false;
  }
  if (!end) {
    setStatus('Data de fim inválida. Use DD/MM/AAAA.', 'error');
    return false;
  }
  if (end < start) {
    setStatus('A data de fim não pode ser anterior à data de início.', 'error');
    return false;
  }
  const agora = new Date();
  if (start > agora || end > agora) {
    setStatus('As datas não podem ser futuras.', 'error');
    return false;
  }
  return true;
}

async function uploadFiles(files, envioId) {
  if (!window.storage || typeof window.storage.ref !== 'function') {
    throw new Error('Firebase Storage não disponível nesta página. O upload não é possível.');
  }

  const totalBytes = Array.from(files).reduce((sum, file) => sum + file.size, 0);
  let progressBytes = 0;

  const uploads = Array.from(files).map((file, index) => {
    const nomeArquivo = `${Date.now()}-${index + 1}-${file.name}`;
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
      }, reject, async () => {
        try {
          const url = await task.snapshot.ref.getDownloadURL();
          resolve({ nome: file.name, url });
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

async function registrarEventoBackend(acao, detalhes = {}) {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const backendBase = isLocal ? 'http://localhost:3001' : window.location.origin;
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
  return '../sucesso.html';
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

function getModalState() {
  return window.__avisoAtestadoConfirmado === true;
}

function setModalState(value) {
  window.__avisoAtestadoConfirmado = value === true;
}

function showWarningModal() {
  setModalState(false);
  showModal();
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
    let arquivosUpload = [];
    try {
      arquivosUpload = await uploadFiles(arquivosInput.files, envioId);
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

    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const backendBase = isLocal ? 'http://localhost:3001' : window.location.origin;

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

  if (tipoAtestado) {
    tipoAtestado.addEventListener('change', () => {
      updateSpecialFields();
    });
  }

  if (dataInicio) {
    dataInicio.addEventListener('change', updateDaysFromDates);
  }
  if (dataFim) {
    dataFim.addEventListener('change', updateDaysFromDates);
  }

  if ($('#modalAvisoConfirmarCheck')) {
    $('#modalAvisoConfirmarCheck').addEventListener('change', () => {
      if ($('#modalAvisoContinuar')) {
        $('#modalAvisoContinuar').disabled = !$('#modalAvisoConfirmarCheck').checked;
      }
      setModalState($('#modalAvisoConfirmarCheck').checked);
    });
  }

  $('#modalAvisoContinuar')?.addEventListener('click', () => hideModal());
  $('#modalAvisoCancelar')?.addEventListener('click', () => hideModal());
  $('#formBackToIndexBtn')?.addEventListener('click', () => {
    setStatus('', 'info');
  });

  initAttachmentHandlers();
  updateSpecialFields();
}

document.addEventListener('DOMContentLoaded', initForm);