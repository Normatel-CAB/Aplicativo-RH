/**
 * permissions.js — Módulo central de permissões por cargo
 *
 * Cargos disponíveis:
 *   admin       — Acesso completo
 *   colaborador — Acesso restrito (visualizar / marcar feito / atestados)
 *
 * Uso:
 *   RHPermissions.can('canCreateProject')   → boolean
 *   RHPermissions.sincronizarRole()         → Promise<string> (sincroniza com Firestore)
 *   RHPermissions.aplicarPermissoesUI()     → oculta elementos com data-permissao=""
 *   RHPermissions.protegerRota(['admin'])   → redireciona se não tiver permissão
 */
(function (global) {
  'use strict';

  var STORAGE_ROLE_KEY  = 'rh_user_role';
  var STORAGE_EMAIL_KEY = 'rh_user_email';

  // ── Definição de cargos e suas permissões ────────────────────────────────────
  // Adicionar novos cargos aqui sem alterar o restante do código.
  var ROLES = {
    admin: {
      label:              'Administrador',
      canCreateProject:   true,
      canEditProject:     true,
      canDeleteProject:   true,
      canMarkProjectDone: true,
      canViewAtestados:   true,
      canDeleteAtestado:  true,
      canApproveUsers:    true,
      canManageUsers:     true,
    },
    colaborador: {
      label:              'Colaborador RH',
      canCreateProject:   false,
      canEditProject:     false,
      canDeleteProject:   false,
      canMarkProjectDone: true,
      canViewAtestados:   true,
      canDeleteAtestado:  true,
      canApproveUsers:    false,
      canManageUsers:     false,
    },
  };

  // ── Leitura / escrita do cargo ───────────────────────────────────────────────

  function getRole() {
    var r = String(localStorage.getItem(STORAGE_ROLE_KEY) || '').toLowerCase().trim();
    return ROLES[r] ? r : 'colaborador';
  }

  function setRole(role) {
    var r = String(role || '').toLowerCase().trim();
    if (ROLES[r]) {
      localStorage.setItem(STORAGE_ROLE_KEY, r);
    }
  }

  function clearRole() {
    localStorage.removeItem(STORAGE_ROLE_KEY);
  }

  // ── Verificação de permissão ─────────────────────────────────────────────────

  function can(permission) {
    var role = getRole();
    return ROLES[role] && ROLES[role][permission] === true;
  }

  function getRoleLabel() {
    return (ROLES[getRole()] && ROLES[getRole()].label) || 'Colaborador RH';
  }

  // ── Sincronização com Firestore ──────────────────────────────────────────────
  // Lê o cargo salvo no documento do usuário e atualiza o localStorage.
  // Retorna Promise que resolve com o cargo atual.

  function sincronizarRole() {
    return new Promise(function (resolve) {
      var email = String(localStorage.getItem(STORAGE_EMAIL_KEY) || '').trim().toLowerCase();

      if (!email || typeof window.firebase === 'undefined' || typeof window.firebase.firestore !== 'function') {
        resolve(getRole());
        return;
      }

      try {
        window.firebase.firestore()
          .collection('usuarios_rh')
          .where('email', '==', email)
          .limit(1)
          .get()
          .then(function (snap) {
            if (!snap.empty) {
              var dados = snap.docs[0].data() || {};
              var roleAnterior = getRole();
              var r = String(dados.role || 'colaborador').toLowerCase().trim();
              setRole(ROLES[r] ? r : 'colaborador');
              // Se o cargo mudou (ex.: estava como colaborador no cache), aplica UI imediatamente
              if (roleAnterior !== getRole()) {
                aplicarPermissoesUI();
              }
            }
            resolve(getRole());
          })
          .catch(function () {
            resolve(getRole());
          });
      } catch (_e) {
        resolve(getRole());
      }
    });
  }

  // ── Proteção de rota ─────────────────────────────────────────────────────────
  // Chame no topo de scripts de páginas restritas.
  // Ex: RHPermissions.protegerRota(['admin'])

  function protegerRota(rolesPermitidos) {
    var permitidos = Array.isArray(rolesPermitidos) ? rolesPermitidos : Object.keys(ROLES);
    var email = String(localStorage.getItem(STORAGE_EMAIL_KEY) || '').trim();

    if (!email) {
      window.location.replace('rh-login.html');
      return false;
    }

    if (permitidos.indexOf(getRole()) === -1) {
      window.location.replace('rh-atestados.html');
      return false;
    }

    return true;
  }

  // ── Aplicação de permissões na UI ────────────────────────────────────────────
  // Oculta/mostra elementos com atributo data-permissao="<permission>".
  // Atualiza o badge de cargo se existir #roleUsuarioBadge.

  function aplicarPermissoesUI() {
    document.querySelectorAll('[data-permissao]').forEach(function (el) {
      var perm = el.getAttribute('data-permissao');
      if (!perm) return;

      if (can(perm)) {
        el.style.removeProperty('display');
        el.removeAttribute('aria-hidden');
      } else {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      }
    });

    var badge = document.getElementById('roleUsuarioBadge');
    if (badge) {
      badge.textContent = getRoleLabel();
      badge.setAttribute('data-role', getRole());
    }
  }

  // ── Exportação global ────────────────────────────────────────────────────────

  global.RHPermissions = {
    ROLES:               ROLES,
    getRole:             getRole,
    setRole:             setRole,
    clearRole:           clearRole,
    can:                 can,
    getRoleLabel:        getRoleLabel,
    sincronizarRole:     sincronizarRole,
    protegerRota:        protegerRota,
    aplicarPermissoesUI: aplicarPermissoesUI,
  };

})(window);
