//const BACKEND_URL = '';

let usuarioLogado = null;
let adminMensagemTimer = null;

function obterTokenArmazenado() {
  return localStorage.getItem('rh_auth_token');
}

function obterEmailArmazenado() {
  return localStorage.getItem('rh_user_email');
}

function obterNomeArmazenado() {
  return localStorage.getItem('rh_user_nome');
}

function definirMensagem(texto, tipo = 'loading') {
  const msgDiv = document.getElementById('mensagem');
  if (adminMensagemTimer) {
    clearTimeout(adminMensagemTimer);
    adminMensagemTimer = null;
  }

  msgDiv.textContent = texto;
  msgDiv.className = 'status-message status-toast';
  msgDiv.classList.add(tipo === 'error' ? 'status-message--error' : tipo === 'success' ? 'status-message--success' : 'status-message--info');
  msgDiv.classList.remove('hidden');

  if (tipo === 'success' || tipo === 'info') {
    adminMensagemTimer = setTimeout(() => {
      msgDiv.textContent = '';
      msgDiv.className = 'status-message status-toast hidden';
      adminMensagemTimer = null;
    }, 4000);
  }
}

function voltarParaPainel() {
  window.location.href = 'rh-atestados.html';
}

function verificarAutenticacao() {
  const token = obterTokenArmazenado();
  const email = obterEmailArmazenado();
  
  if (!token || !email) {
    window.location.href = 'rh-login.html';
    return false;
  }
  
  usuarioLogado = { token, email };
  return true;
}

async function carregarUsuariosPendentes() {
  const carregando = document.getElementById('carregando');
  carregando.classList.remove('hidden');
  try {
    // Busca usuários pendentes no Firestore
    const snap = await window.firebase.firestore().collection('usuarios_rh').where('status', '==', 'pendente').get();
    carregando.classList.add('hidden');
    const totalPendentes = document.getElementById('totalPendentes');
    totalPendentes.textContent = snap.size;
    const listaPendentes = document.getElementById('listaPendentes');
    if (snap.empty) {
      listaPendentes.innerHTML = '<div class="status-vazio">✅ Nenhum usuário pendente de aprovação</div>';
      return;
    }
    listaPendentes.innerHTML = '';
    snap.forEach(doc => {
      const usuario = doc.data();
      const div = document.createElement('div');
      div.className = 'usuario-item';
      div.innerHTML = `
        <div class="usuario-info">
          <div class="usuario-nome">${usuario.nome}</div>
          <div class="usuario-email">${usuario.email}</div>
          <div class="usuario-data">Cadastrado em: ${new Date(usuario.criado_em).toLocaleDateString('pt-BR')} ${new Date(usuario.criado_em).toLocaleTimeString('pt-BR')}</div>
        </div>
        <div class="usuario-acoes">
          <button class="btn-aprovar" onclick="aprovarUsuario('${doc.id}', '${usuario.nome}')">Aprovar</button>
          <button class="btn-rejeitar" onclick="rejeitarUsuario('${doc.id}', '${usuario.nome}')">Rejeitar</button>
        </div>
      `;
      listaPendentes.appendChild(div);
    });
  } catch (err) {
    carregando.classList.add('hidden');
    definirMensagem(`❌ Erro ao carregar usuários: ${err.message}`, 'error');
  }
}

async function aprovarUsuario(usuarioId, usuarioNome) {
  if (!confirm(`Tem certeza que deseja aprovar ${usuarioNome}?`)) {
    return;
  }
  definirMensagem('⏳ Aprovando usuário...', 'loading');
  try {
    await window.firebase.firestore().collection('usuarios_rh').doc(usuarioId).update({ status: 'aprovado' });
    definirMensagem(`✅ ${usuarioNome} foi aprovado com sucesso!`, 'success');
    setTimeout(() => {
      carregarUsuariosPendentes();
    }, 1500);
  } catch (err) {
    console.error('Erro ao aprovar:', err);
    definirMensagem(`❌ Erro ao aprovar: ${err.message}`, 'error');
  }
}

async function rejeitarUsuario(usuarioId, usuarioNome) {
  if (!confirm(`Tem certeza que deseja rejeitar ${usuarioNome}? Esta ação não poderá ser desfeita.`)) {
    return;
  }

  definirMensagem('⏳ Rejeitando usuário...', 'loading');
  try {
    // Atualiza o status do usuário para "rejeitado" no Firestore
    await window.firebase.firestore().collection('usuarios_rh').doc(usuarioId).update({ status: 'rejeitado' });
    definirMensagem(`✅ ${usuarioNome} foi rejeitado e removido do sistema.`, 'success');
    setTimeout(() => {
      carregarUsuariosPendentes();
    }, 1500);
  } catch (err) {
    console.error('Erro ao rejeitar:', err);
    definirMensagem(`❌ Erro ao rejeitar: ${err.message}`, 'error');
  }
}

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOMContentLoaded disparado em rh-admin.js');
    if (verificarAutenticacao()) {
      const nomeUsuario = obterNomeArmazenado();
      console.log(`👤 Usuário autenticado: ${nomeUsuario}`);
      carregarUsuariosPendentes();
    }
  });
} else {
  // DOM já carregado
  console.log('✅ DOM já estava carregado em rh-admin.js');
  if (verificarAutenticacao()) {
    const nomeUsuario = obterNomeArmazenado();
    console.log(`👤 Usuário autenticado: ${nomeUsuario}`);
    carregarUsuariosPendentes();
  }
}
