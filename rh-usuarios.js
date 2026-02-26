const usuariosStatus = document.getElementById('usuariosStatus');
const usuariosPendentes = document.getElementById('usuariosPendentes');
const voltarPainelBtn = document.getElementById('voltarPainelBtn');
const sairRhBtn = document.getElementById('sairRhBtn');

let pocketbaseClient;
let pocketbaseConfig;

function setUsuariosStatus(texto, tipo = 'info') {
  usuariosStatus.textContent = texto;
  usuariosStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  if (tipo === 'error') {
    usuariosStatus.classList.add('status-message--error');
  } else if (tipo === 'success') {
    usuariosStatus.classList.add('status-message--success');
  } else {
    usuariosStatus.classList.add('status-message--info');
  }
}

function iniciarPocketBase() {
  if (!window.POCKETBASE_CONFIG || !window.PocketBase) {
    return false;
  }

  const config = window.POCKETBASE_CONFIG;
  const baseUrlValida = typeof config.baseUrl === 'string' && /^https?:\/\//i.test(config.baseUrl);
  const authCollectionValida = typeof config.authCollection === 'string' && config.authCollection.trim().length > 0;

  if (!baseUrlValida || !authCollectionValida) {
    return false;
  }

  pocketbaseConfig = {
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    authCollection: config.authCollection
  };

  pocketbaseClient = new window.PocketBase(pocketbaseConfig.baseUrl);
  pocketbaseClient.autoCancellation(false);
  return true;
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
  card.className = 'usuario-pendente-card';

  const nome = escaparHtml(usuario.name || 'Sem nome');
  const email = escaparHtml(usuario.email || '-');
  const dataCadastro = formatarData(usuario.created || '');

  card.innerHTML = `
    <h3>${nome}</h3>
    <p><strong>E-mail:</strong> ${email}</p>
    <p><strong>Cadastrado em:</strong> ${dataCadastro}</p>
    <button type="button" class="aprovar-usuario-btn" data-user-id="${usuario.id}">Aprovar usuário</button>
  `;

  return card;
}

async function carregarPendentes() {
  setUsuariosStatus('Carregando usuários pendentes...', 'info');
  usuariosPendentes.innerHTML = '';

  try {
    const pendentes = await pocketbaseClient.collection(pocketbaseConfig.authCollection).getFullList({
      sort: 'created',
      filter: 'emailVisibility = false'
    });

    if (!pendentes.length) {
      setUsuariosStatus('Nenhum usuário pendente de aprovação.', 'info');
      return;
    }

    pendentes.forEach((usuario) => {
      usuariosPendentes.appendChild(criarCardPendente(usuario));
    });

    setUsuariosStatus(`Usuários pendentes: ${pendentes.length}`, 'success');
  } catch (error) {
    const detalhe = error?.response?.message || error?.message || 'Falha ao carregar usuários.';
    setUsuariosStatus(`Erro: ${detalhe}`, 'error');
  }
}

async function aprovarUsuario(userId, botao) {
  botao.disabled = true;
  botao.textContent = 'Aprovando...';

  try {
    await pocketbaseClient.collection(pocketbaseConfig.authCollection).update(userId, {
      emailVisibility: true
    });

    const card = botao.closest('.usuario-pendente-card');
    if (card) {
      card.remove();
    }

    const totalRestante = usuariosPendentes.querySelectorAll('.usuario-pendente-card').length;
    setUsuariosStatus(
      totalRestante ? `Usuários pendentes: ${totalRestante}` : 'Nenhum usuário pendente de aprovação.',
      totalRestante ? 'success' : 'info'
    );
  } catch (error) {
    const detalhe = error?.response?.message || error?.message || 'Falha ao aprovar usuário.';
    setUsuariosStatus(`Erro ao aprovar: ${detalhe}`, 'error');
    botao.disabled = false;
    botao.textContent = 'Aprovar usuário';
  }
}

usuariosPendentes.addEventListener('click', (event) => {
  const botao = event.target.closest('.aprovar-usuario-btn');
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
    if (pocketbaseClient) {
      pocketbaseClient.authStore.clear();
    }
    window.location.href = 'index.html';
  });
}

(function init() {
  const ok = iniciarPocketBase();

  if (!ok) {
    setUsuariosStatus('Configuração inválida do PocketBase.', 'error');
    return;
  }

  if (!pocketbaseClient.authStore.isValid) {
    setUsuariosStatus('Sessão RH não encontrada. Faça login novamente.', 'error');
    return;
  }

  const usuarioAtual = pocketbaseClient.authStore.model;

  if (!usuarioAprovado(usuarioAtual)) {
    pocketbaseClient.authStore.clear();
    setUsuariosStatus('Seu acesso RH está pendente de aprovação.', 'error');
    return;
  }

  if (!usuarioAdministrador(usuarioAtual)) {
    setUsuariosStatus('Acesso permitido apenas para administrador.', 'error');
    return;
  }

  carregarPendentes();
})();
