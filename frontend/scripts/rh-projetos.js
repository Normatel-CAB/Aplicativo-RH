// Sistema de gerenciamento de projetos — Painel RH
(function () {
  'use strict';

  const COLECAO = 'projetos';

  // Projetos fixos que sempre aparecem no painel (não podem ser excluídos via UI)
  const PROJETOS_PADRAO = [
    { id: 'padrao-736', codigo: '736', nome: 'Projeto 736', base: 'Base Imbetiba',                               status: 'ativo', padrao: true },
    { id: 'padrao-737', codigo: '737', nome: 'Projeto 737', base: 'Base Imboassica',                             status: 'ativo', padrao: true },
    { id: 'padrao-743', codigo: '743', nome: 'Projeto 743', base: 'Bases: Cabiunas, Severina e Barra do Furado', status: 'ativo', padrao: true },
    { id: 'padrao-741', codigo: '741', nome: 'Projeto 741', base: 'Bases: UTE, Áreas Externa e Tapera',          status: 'ativo', padrao: true },
    { id: 'padrao-742', codigo: '742', nome: 'Projeto 742', base: 'Base: Cenpes',                               status: 'ativo', padrao: true },
    { id: 'padrao-744', codigo: '744', nome: 'Apoio Macaé', titulo: 'Apoio Macaé', base: 'Base de apoio',      status: 'ativo', padrao: true },
  ];

  const STATUS_MAP = {
    ativo:     { label: 'Ativo',     cor: 'green' },
    inativo:   { label: 'Inativo',   cor: 'gray'  },
    concluido: { label: 'Concluído', cor: 'blue'  }
  };

  // ── estado ──────────────────────────────────────────────────────────────────
  let _ouvinte = null;
  let _editandoId = null;
  let _salvando = false;

  // ── referências DOM ─────────────────────────────────────────────────────────
  let $container, $modal, $form, $statusBar, $modalTitulo, $btnSalvar;

  // ── inicialização ───────────────────────────────────────────────────────────
  function init() {
    $container  = document.getElementById('projetosCardsContainer');
    $modal      = document.getElementById('modalProjeto');
    $form       = document.getElementById('formCriarProjeto');
    $statusBar  = document.getElementById('projetosStatusMsg');
    $modalTitulo = $modal && $modal.querySelector('.modal-titulo');
    $btnSalvar  = $modal && $modal.querySelector('[data-acao="salvar"]');

    const $btnAdicionar = document.getElementById('btnAdicionarProjeto');
    if ($btnAdicionar) $btnAdicionar.addEventListener('click', abrirModalCriar);

    if ($modal) {
      $modal.addEventListener('click', (e) => { if (e.target === $modal) fecharModal(); });
      const $close = $modal.querySelector('.modal-close-btn');
      if ($close) $close.addEventListener('click', fecharModal);
      const $cancel = $modal.querySelector('[data-acao="cancelar"]');
      if ($cancel) $cancel.addEventListener('click', fecharModal);
    }

    if ($form) $form.addEventListener('submit', onSubmit);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $modal && $modal.classList.contains('modal-aberto')) fecharModal();
    });

    const syncRole = window.RHPermissions
      ? window.RHPermissions.sincronizarRole()
      : Promise.resolve();

    syncRole.then(() => {
      if (window.RHPermissions) window.RHPermissions.aplicarPermissoesUI();
      iniciarListener();
    });
  }

  // ── firestore ───────────────────────────────────────────────────────────────
  function db() {
    try { return window.firebase && typeof window.firebase.firestore === 'function' ? window.firebase.firestore() : null; }
    catch { return null; }
  }

  function iniciarListener() {
    const fs = db();
    // Sempre exibe os projetos padrão imediatamente
    if (!fs) { renderCards(PROJETOS_PADRAO); return; }

    if (_ouvinte) { _ouvinte(); _ouvinte = null; }

    // Mostra os padrões enquanto carrega do Firestore
    renderCards(PROJETOS_PADRAO);

    try {
      _ouvinte = fs.collection(COLECAO)
        .orderBy('criado_em', 'desc')
        .onSnapshot(
          (snap) => {
            const dinamicos = snap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(p => !p.excluido);
            // padrões primeiro, novos depois
            renderCards([...PROJETOS_PADRAO, ...dinamicos]);
            setStatus('');
          },
          () => {
            // fallback: mantém só os padrões
            renderCards(PROJETOS_PADRAO);
            setStatus('');
          }
        );
    } catch {
      renderCards(PROJETOS_PADRAO);
    }
  }

  async function salvar(dados) {
    const fs = db();
    if (!fs) throw new Error('Firebase indisponível');

    const agora = new Date().toISOString();
    const email = localStorage.getItem('rh_user_email') || '';

    if (_editandoId) {
      await fs.collection(COLECAO).doc(_editandoId).set(
        { ...dados, atualizado_em: agora },
        { merge: true }
      );
    } else {
      // ID = nome do projeto (sem barras, espaços normalizados)
      const id = dados.nome.trim().replace(/\//g, '-').replace(/\s+/g, ' ');
      await fs.collection(COLECAO).doc(id).set({
        ...dados,
        id,
        criado_em:  agora,
        atualizado_em: agora,
        criado_por: email,
        excluido:   false
      });
    }
  }

  async function excluir(id) {
    const fs = db();
    if (!fs) throw new Error('Firebase indisponível');
    await fs.collection(COLECAO).doc(id).set(
      { excluido: true, excluido_em: new Date().toISOString() },
      { merge: true }
    );
  }

  // ── contagem de atestados por projeto ──────────────────────────────────────
  // Usa query filtrada por código para evitar carregar toda a coleção
  async function contarAtestados(codigoProjeto) {
    const fs = db();
    if (!fs || !codigoProjeto) return 0;
    try {
      const codigo = String(codigoProjeto);
      // Projetos padrão têm código numérico — filtramos pelos valores possíveis no campo projeto
      // (ex: "Projeto 736 - Base Imbetiba" contém "736")
      // Firestore não suporta LIKE; usamos range query para prefixo
      const prefixo = /^\d+$/.test(codigo) ? `Projeto ${codigo}` : codigo;
      const snap = await fs.collection('envios_atestados')
        .where('projeto', '>=', prefixo)
        .where('projeto', '<', prefixo + '')
        .get();
      return snap.docs.filter(d => !d.data().excluido).length;
    } catch { return 0; }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  function renderCards(projetos) {
    if (!$container) return;
    $container.innerHTML = '';

    if (!projetos.length) {
      const el = document.createElement('p');
      el.className = 'projetos-vazio';
      el.textContent = 'Nenhum projeto cadastrado. Clique em "+ Adicionar Projeto" para começar.';
      $container.appendChild(el);
      return;
    }

    projetos.forEach(p => {
      const card = buildCard(p);
      $container.appendChild(card);
      // atualiza contagem assíncronamente
      if (p.codigo) {
        contarAtestados(p.codigo).then(n => {
          const badge = card.querySelector('.badge-atestados');
          if (badge) badge.textContent = `${n} atestado${n !== 1 ? 's' : ''}`;
        });
      }
    });
  }

  function buildCard(p) {
    const st = STATUS_MAP[p.status] || STATUS_MAP.ativo;
    const wrap = document.createElement('div');
    wrap.className = `projeto-card projeto-card--rh${p.status === 'inativo' ? ' projeto-card--inativo' : ''}`;
    wrap.setAttribute('data-projeto', sanitize(p.codigo || p.id));
    wrap.setAttribute('data-projeto-id', p.id);

    const nomeLabel = p.titulo ? sanitize(p.titulo) : (p.codigo ? `Projeto ${sanitize(p.codigo)}` : sanitize(p.nome));
    const baseLabel = sanitize(p.base || p.descricao || '');
    const respLabel = p.responsavel ? `<span class="proj-meta-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${sanitize(p.responsavel)}</span>` : '';

    const canEdit   = window.RHPermissions ? window.RHPermissions.can('canEditProject')   : false;
    const canDelete = window.RHPermissions ? window.RHPermissions.can('canDeleteProject') : false;
    const btnVer = `<button type="button" class="btn-proj-ver${p.padrao ? ' btn-proj-ver--full' : ''}" data-codigo="${sanitize(p.codigo || p.id)}">Ver atestados</button>`;
    const btnEdit   = canEdit   ? `<button type="button" class="btn-proj-edit" data-id="${p.id}">Editar</button>`   : '';
    const btnDelete = canDelete ? `<button type="button" class="btn-proj-del"  data-id="${p.id}">Excluir</button>`  : '';

    const acoesPadrao    = btnVer;
    const acoesCompletas = btnVer + btnEdit + btnDelete;

    wrap.innerHTML = `
      <div class="projeto-card-top">
        <div class="projeto-card-info">
          <strong>${nomeLabel}</strong>
          <span>${baseLabel}</span>
        </div>
        <span class="proj-status-badge proj-status-badge--${st.cor}">${st.label}</span>
      </div>
      <div class="projeto-card-meta">
        ${respLabel}
        <span class="proj-meta-item badge-atestados"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>carregando…</span>
      </div>
      <div class="projeto-card-actions">
        ${p.padrao ? acoesPadrao : acoesCompletas}
      </div>`;

    wrap.querySelector('.btn-proj-ver').addEventListener('click', (e) => {
      e.stopPropagation();
      const cod = e.currentTarget.dataset.codigo;
      if (typeof window.abrirProjetoEmNovaAba === 'function') window.abrirProjetoEmNovaAba(cod);
    });

    if (!p.padrao) {
      const $edit = wrap.querySelector('.btn-proj-edit');
      const $del  = wrap.querySelector('.btn-proj-del');
      if ($edit) $edit.addEventListener('click', (e) => { e.stopPropagation(); abrirModalEditar(p); });
      if ($del)  $del.addEventListener('click',  (e) => { e.stopPropagation(); onExcluir(p); });
    }

    return wrap;
  }

  function sanitize(v) {
    const d = document.createElement('div');
    d.textContent = String(v || '');
    return d.innerHTML;
  }

  // ── modal ───────────────────────────────────────────────────────────────────
  function abrirModalCriar() {
    if (window.RHPermissions && !window.RHPermissions.can('canCreateProject')) return;
    _editandoId = null;
    resetForm();
    if ($modalTitulo) $modalTitulo.textContent = 'Adicionar Projeto';
    if ($btnSalvar)   $btnSalvar.textContent   = 'Criar Projeto';
    abrirModal();
  }

  function abrirModalEditar(p) {
    _editandoId = p.id;
    resetForm();
    preencherForm(p);
    if ($modalTitulo) $modalTitulo.textContent = 'Editar Projeto';
    if ($btnSalvar)   $btnSalvar.textContent   = 'Salvar Alterações';
    abrirModal();
  }

  function abrirModal() {
    if (!$modal) return;
    $modal.classList.add('modal-aberto');
    document.body.classList.add('modal-open');
    setTimeout(() => { const f = $modal.querySelector('input,select,textarea'); if (f) f.focus(); }, 80);
  }

  function fecharModal() {
    if (!$modal) return;
    $modal.classList.remove('modal-aberto');
    document.body.classList.remove('modal-open');
    _editandoId = null;
    setFormMsg('');
  }

  function preencherForm(p) {
    if (!$form) return;
    ['nome', 'descricao'].forEach(k => {
      const el = $form.querySelector(`[name="${k}"]`);
      if (el) el.value = p[k] || '';
    });
  }

  function resetForm() {
    if ($form) $form.reset();
    setFormMsg('');
  }

  function setFormMsg(msg, tipo = '') {
    const el = $form && $form.querySelector('.form-status-msg');
    if (!el) return;
    el.textContent = msg;
    el.className = `form-status-msg${msg ? ` form-status-msg--${tipo}` : ' hidden'}`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (_salvando) return;
    const perm = _editandoId ? 'canEditProject' : 'canCreateProject';
    if (window.RHPermissions && !window.RHPermissions.can(perm)) return;

    const nome = ($form.querySelector('[name="nome"]')?.value || '').trim();
    if (!nome) { setFormMsg('Nome do projeto é obrigatório.', 'error'); return; }

    const dados = {
      nome,
      descricao: ($form.querySelector('[name="descricao"]')?.value || '').trim(),
      status: 'ativo'
    };

    _salvando = true;
    if ($btnSalvar) { $btnSalvar.disabled = true; $btnSalvar.textContent = 'Salvando…'; }
    setFormMsg('');

    try {
      await salvar(dados);
      fecharModal();
      setStatus(_editandoId ? 'Projeto atualizado com sucesso!' : 'Projeto criado com sucesso!', 'success');
    } catch (err) {
      setFormMsg(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
      _salvando = false;
      if ($btnSalvar) {
        $btnSalvar.disabled = false;
        $btnSalvar.textContent = _editandoId ? 'Salvar Alterações' : 'Criar Projeto';
      }
    }
  }

  function confirmarExclusaoProjeto(nome) {
    return new Promise((resolve) => {
      const overlay   = document.getElementById('modalConfirmarExclusaoProjeto');
      const btnOk     = document.getElementById('modalExclusaoProjetoConfirmar');
      const btnCancel = document.getElementById('modalExclusaoProjetoCancelar');
      const msgEl     = document.getElementById('modalExclusaoProjetoMsg');

      if (!overlay || !btnOk || !btnCancel) {
        resolve(window.confirm(`Excluir o projeto "${nome}"?\nOs atestados existentes serão preservados.`));
        return;
      }

      if (msgEl) msgEl.textContent = `Excluir o projeto "${nome}"?`;

      overlay.classList.add('modal-aberto');
      document.body.classList.add('modal-open');
      btnOk.focus();

      function fechar(resultado) {
        overlay.classList.remove('modal-aberto');
        document.body.classList.remove('modal-open');
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        document.removeEventListener('keydown', onEsc);
        resolve(resultado);
      }

      function onOk()      { fechar(true); }
      function onCancel()  { fechar(false); }
      function onOverlay(e){ if (e.target === overlay) fechar(false); }
      function onEsc(e)    { if (e.key === 'Escape') fechar(false); }

      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
      document.addEventListener('keydown', onEsc);
    });
  }

  async function onExcluir(p) {
    if (window.RHPermissions && !window.RHPermissions.can('canDeleteProject')) return;
    const nome = p.nome || p.codigo || p.id;
    if (!await confirmarExclusaoProjeto(nome)) return;
    try {
      await excluir(p.id);
      setStatus('Projeto excluído.', 'success');
    } catch (err) {
      setStatus(`Erro ao excluir: ${err.message}`, 'error');
    }
  }

  // ── barra de status ─────────────────────────────────────────────────────────
  let _statusTimer = null;
  function setStatus(msg, tipo = 'info') {
    if (!$statusBar) return;
    clearTimeout(_statusTimer);
    $statusBar.textContent = msg;
    $statusBar.className = `rh-list-status status-message status-message--${tipo}${msg ? '' : ' hidden'}`;
    if (msg && (tipo === 'success' || tipo === 'info')) {
      _statusTimer = setTimeout(() => {
        $statusBar.textContent = '';
        $statusBar.classList.add('hidden');
      }, 4000);
    }
  }

  // Desconecta o listener ao sair da página para evitar memory leak
  window.addEventListener('beforeunload', () => { if (_ouvinte) { _ouvinte(); _ouvinte = null; } });

  // ── API pública ─────────────────────────────────────────────────────────────
  window.ProjetoManager = { init, abrirModalCriar };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
