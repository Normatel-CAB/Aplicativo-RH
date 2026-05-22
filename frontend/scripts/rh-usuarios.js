const usuariosStatus = document.getElementById('usuariosStatus');
const usuariosPendentes = document.getElementById('usuariosPendentes');
const totalPendentes = document.getElementById('totalPendentes');
const voltarPainelBtn = document.getElementById('voltarPainelBtn');
const sairRhBtn = document.getElementById('sairRhBtn');
const DEFAULT_REMOTE_BACKEND_URL = '';

function resolverBackendUrl() {
  const valorConfigurado = String(localStorage.getItem('rh_backend_url') || '').trim();

  if (valorConfigurado) {
    try {
      const url = new URL(valorConfigurado);
      const hostLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (!hostLocal && url.protocol === 'http:') {
        url.protocol = 'https:';
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      return valorConfigurado.replace(/\/+$/, '');
    }
  }

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3001';
  }

  if (window.__RH_BACKEND_URL__) {
    return String(window.__RH_BACKEND_URL__).trim().replace(/\/+$/, '');
  }

  return DEFAULT_REMOTE_BACKEND_URL;
}

const BACKEND_URL = resolverBackendUrl();

let usuariosStatusTimer = null;

function registrarEventoBackend(acao, detalhes = {}) {
  if (!BACKEND_URL) {
    return;
  }

  const payload = {
    acao,
    pagina: 'rh-usuarios.html',
    email: localStorage.getItem('rh_user_email') || '',
    usuarioId: localStorage.getItem('rh_user_id') || '',
    detalhes
  };

  fetch(`${BACKEND_URL}/api/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

function setUsuariosStatus(texto, tipo = 'info') {
  if (usuariosStatusTimer) {
    clearTimeout(usuariosStatusTimer);
    usuariosStatusTimer = null;
  }

  usuariosStatus.textContent = texto;
  usuariosStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    usuariosStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    usuariosStatus.classList.add('status-message--success');
  } else {
    usuariosStatus.classList.add('status-message--info');
  }

  if (tipo === 'success' || tipo === 'info') {
    usuariosStatusTimer = setTimeout(() => {
      usuariosStatus.textContent = '';
      usuariosStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
      usuariosStatusTimer = null;
    }, 4000);
  }
}

function formatarData(valorData) {
  if (!valorData || typeof valorData !== 'string') {
    return '-';
  }

  const data = valorData.slice(0, 10);
  const partes = data.split('-');
  if (partes.length !== 3) {
    return data;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function criarCardPendente(usuario) {
  const card = document.createElement('article');
  card.className = 'usuario-item';

  const nome = escaparHtml(usuario.nome || usuario.name || 'Sem nome');
  const email = escaparHtml(usuario.email || '-');
  const dataCadastro = escaparHtml(formatarData(usuario.criado_em || usuario.created || ''));

  card.innerHTML = `
    <div class="usuario-info">
      <div class="usuario-nome">${nome}</div>
      <div class="usuario-email">${email}</div>
      <div class="usuario-data">Cadastrado em: ${dataCadastro}</div>
    </div>
    <div class="usuario-acoes">
      <label class="usuario-cargo-label">
        Cargo
        <select class="usuario-cargo-select">
          <option value="colaborador" selected>Colaborador RH</option>
          <option value="admin">Administrador</option>
        </select>
      </label>
      <button type="button" class="btn-aprovar" data-user-id="${usuario.id}">Aprovar</button>
    </div>
  `;

  return card;
}

function obterFirestore() {
  if (typeof window?.firebase?.firestore !== 'function') {
    throw new Error('FIREBASE_NOT_LOADED');
  }
  return window.firebase.firestore();
}

async function carregarPendentes() {
  setUsuariosStatus('Carregando usuários pendentes...', 'info');
  usuariosPendentes.innerHTML = '';
  if (totalPendentes) {
    totalPendentes.textContent = '0';
  }
  try {
    // Busca usuários com status 'pendente' no Firestore
    const snapshot = await obterFirestore()
      .collection('usuarios_rh')
      .where('status', '==', 'pendente')
      .get();
    const pendentes = snapshot.docs.map((registro) => ({ id: registro.id, ...(registro.data() || {}) }));

    if (totalPendentes) {
      totalPendentes.textContent = String(pendentes.length);
    }

    if (!pendentes.length) {
      usuariosPendentes.innerHTML = '<div class="status-vazio">Nenhum usuário pendente de aprovação</div>';
      setUsuariosStatus('Nenhum usuário pendente de aprovação.', 'info');
      return;
    }
    pendentes.forEach((usuario) => {
      usuariosPendentes.appendChild(criarCardPendente(usuario));
    });
    setUsuariosStatus(`Usuários pendentes: ${pendentes.length}`, 'success');
  } catch (error) {
    setUsuariosStatus(`Erro: ${error?.message || 'Falha ao carregar usuários.'}`, 'error');
  }
}


async function aprovarUsuario(userId, botao) {
  botao.disabled = true;
  botao.textContent = 'Aprovando...';
  try {
    const card = botao.closest('.usuario-item');
    const select = card && card.querySelector('.usuario-cargo-select');
    const role = select ? String(select.value || 'colaborador') : 'colaborador';

    await obterFirestore().collection('usuarios_rh').doc(String(userId)).update({
      status: 'aprovado',
      aprovado: true,
      role,
      atualizado_em: new Date().toISOString(),
    });
    registrarEventoBackend('usuario_aprovado', { usuarioIdAprovado: userId, role });
    if (card) {
      card.remove();
    }
    const totalRestante = usuariosPendentes.querySelectorAll('.usuario-item').length;
    if (totalPendentes) {
      totalPendentes.textContent = String(totalRestante);
    }

    if (totalRestante === 0) {
      usuariosPendentes.innerHTML = '<div class="status-vazio">Nenhum usuário pendente de aprovação</div>';
    }

    setUsuariosStatus(
      totalRestante ? `Usuários pendentes: ${totalRestante}` : 'Nenhum usuário pendente de aprovação.',
      totalRestante ? 'success' : 'info'
    );
  } catch (error) {
    setUsuariosStatus(`Erro ao aprovar: ${error?.message || 'Falha ao aprovar usuário.'}`, 'error');
    botao.disabled = false;
    botao.textContent = 'Aprovar usuário';
  }
}

usuariosPendentes.addEventListener('click', (event) => {
  const botao = event.target.closest('.btn-aprovar');
  if (!botao) {
    return;
  }

  const userId = botao.dataset.userId;
  if (!userId) {
    return;
  }

  aprovarUsuario(userId, botao);
});

if (voltarPainelBtn) {
  voltarPainelBtn.addEventListener('click', () => {
    window.location.href = 'rh-atestados.html';
  });
}

if (sairRhBtn) {
  sairRhBtn.addEventListener('click', () => {
    const emailAtual = localStorage.getItem('rh_user_email') || '';
    localStorage.removeItem('rh_auth_token');
    localStorage.removeItem('rh_user_id');
    localStorage.removeItem('rh_user_email');
    localStorage.removeItem('rh_user_nome');
    localStorage.removeItem('rh_user_pendente');
    localStorage.removeItem('rh_user_role');
    registrarEventoBackend('logout', { email: emailAtual });
    window.location.href = 'rh-login.html';
  });
}


// ── Gerenciamento de cargos ──────────────────────────────────────────────────

const usuariosAprovados = document.getElementById('usuariosAprovados');
const cargosStatus = document.getElementById('cargosStatus');

const LABELS_CARGO = { admin: 'Administrador', colaborador: 'Colaborador RH' };

function setCargosStatus(texto, tipo = 'info') {
  if (!cargosStatus) return;
  cargosStatus.textContent = texto;
  cargosStatus.className = `status-message status-message--${tipo} status-toast${texto ? '' : ' hidden'}`;
}

function criarCardAprovado(usuario) {
  const card = document.createElement('article');
  card.className = 'usuario-item';

  const nome = escaparHtml(usuario.nome || 'Sem nome');
  const email = escaparHtml(usuario.email || '-');
  const roleAtual = String(usuario.role || 'colaborador');
  const labelAtual = LABELS_CARGO[roleAtual] || roleAtual;

  card.innerHTML = `
    <div class="usuario-info">
      <div class="usuario-nome">${nome}</div>
      <div class="usuario-email">${email}</div>
      <div class="usuario-data">
        Cargo atual: <span class="role-badge role-badge--inline" data-role="${roleAtual}">${labelAtual}</span>
      </div>
    </div>
    <div class="usuario-acoes">
      <label class="usuario-cargo-label">
        Novo cargo
        <select class="usuario-cargo-select" data-user-id="${usuario.id}" data-role-atual="${roleAtual}">
          <option value="colaborador"${roleAtual === 'colaborador' ? ' selected' : ''}>Colaborador RH</option>
          <option value="admin"${roleAtual === 'admin' ? ' selected' : ''}>Administrador</option>
        </select>
      </label>
      <button type="button" class="btn-salvar-cargo" data-user-id="${usuario.id}">Salvar cargo</button>
    </div>
  `;

  return card;
}

async function carregarAprovados() {
  if (!usuariosAprovados) return;
  try {
    const snapshot = await obterFirestore()
      .collection('usuarios_rh')
      .where('status', '==', 'aprovado')
      .get();

    const aprovados = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    if (!aprovados.length) {
      usuariosAprovados.innerHTML = '<div class="status-vazio">Nenhum usuário aprovado encontrado.</div>';
      return;
    }

    usuariosAprovados.innerHTML = '';
    aprovados
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      .forEach((u) => usuariosAprovados.appendChild(criarCardAprovado(u)));
  } catch (err) {
    usuariosAprovados.innerHTML = '<div class="status-vazio">Erro ao carregar usuários.</div>';
  }
}

async function salvarCargo(userId, novoRole, botao) {
  const select = botao.closest('.usuario-item')?.querySelector('.usuario-cargo-select');
  const roleAtual = select?.getAttribute('data-role-atual') || '';

  if (novoRole === roleAtual) {
    setCargosStatus('O cargo escolhido é o mesmo atual.', 'info');
    return;
  }

  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    await obterFirestore().collection('usuarios_rh').doc(String(userId)).update({
      role: novoRole,
      atualizado_em: new Date().toISOString(),
    });

    const badge = botao.closest('.usuario-item')?.querySelector('[data-role]');
    if (badge) {
      badge.textContent = LABELS_CARGO[novoRole] || novoRole;
      badge.setAttribute('data-role', novoRole);
    }
    if (select) select.setAttribute('data-role-atual', novoRole);

    setCargosStatus(`Cargo de ${botao.closest('.usuario-item')?.querySelector('.usuario-nome')?.textContent || 'usuário'} atualizado para ${LABELS_CARGO[novoRole] || novoRole}.`, 'success');
  } catch (err) {
    setCargosStatus(`Erro ao salvar: ${err?.message || 'Falha ao atualizar cargo.'}`, 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar cargo';
  }
}

if (usuariosAprovados) {
  usuariosAprovados.addEventListener('click', (event) => {
    const botao = event.target.closest('.btn-salvar-cargo');
    if (!botao) return;
    const userId = botao.dataset.userId;
    const select = botao.closest('.usuario-item')?.querySelector('.usuario-cargo-select');
    const novoRole = select ? select.value : 'colaborador';
    if (userId) salvarCargo(userId, novoRole, botao);
  });
}

// Inicialização direta
registrarEventoBackend('acesso_pagina');
carregarPendentes();
carregarAprovados();
