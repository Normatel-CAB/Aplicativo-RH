/**
 * rh-dashboard-relatorio.js
 * Dashboard multi-tenant de atestados médicos — Normatel RH
 */

'use strict';

/* ─── Constantes ────────────────────────────────────────── */
const RH_PROJETO_CODIGO_KEY      = 'rh_projeto_codigo';
const DEFAULT_REMOTE_BACKEND_URL = 'https://api-vgqcbmomea-uc.a.run.app';
const ITENS_POR_PAGINA           = 15;

const CHART_CORES = [
  '#5fbe4a', '#2fa84f', '#1f7a42', '#86d89a',
  '#f59e0b', '#2563eb', '#e879f9', '#f97316',
  '#06b6d4', '#84cc16', '#ec4899', '#a78bfa'
];

/* ─── Estado ────────────────────────────────────────────── */
let codigoProjeto        = '';
let tituloProjeto        = '';
let todosAtestadosBrutos = [];  // tudo do projeto, sem filtro de período
let todosAtestados       = [];  // após filtro de período/datas
let dadosFiltrados       = [];  // após filtros da UI

let periodoDias   = 30;
let periodoDataDe = '';   // data inicial personalizada (criado_em)
let periodoDataAte = '';  // data final personalizada   (criado_em)

let rankingGlobal = [];
let rankingBusca  = '';
let sortCol       = 'qtd';
let sortDir       = 'desc';
let paginaAtual   = 1;

let instanciaBar   = null;
let instanciaLine  = null;
let instanciaDonut = null;

/* ─── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', inicializar);

async function inicializar() {
  const params = new URLSearchParams(window.location.search);
  codigoProjeto = params.get('projeto')
    || sessionStorage.getItem(RH_PROJETO_CODIGO_KEY)
    || '';

  if (!codigoProjeto) {
    setStatus('Projeto não identificado. Redirecionando ao painel…');
    setTimeout(() => { window.location.href = 'rh-atestados.html'; }, 1800);
    return;
  }

  tituloProjeto = montarTituloProjeto(codigoProjeto);
  document.getElementById('dashProjetoNome').textContent = tituloProjeto;
  document.title = `Relatório — ${tituloProjeto}`;

  registrarEventos();
  await carregarAtestados();
}

/* ─── Firestore ─────────────────────────────────────────── */
async function carregarAtestados() {
  setStatus('Carregando dados do projeto…');
  renderCarregando();

  try {
    const todos = await buscarTodosEnvios();

    // Isola o projeto e remove excluídos client-side
    todosAtestadosBrutos = todos.filter(doc =>
      doc.excluido !== true &&
      correspondeProjeto(doc.projeto || '', codigoProjeto)
    );

    reaplicarPeriodo();

    const total = todosAtestadosBrutos.length;
    setStatus(`${total} atestado${total !== 1 ? 's' : ''} carregado${total !== 1 ? 's' : ''} para "${tituloProjeto}"`);

  } catch (err) {
    console.error('[Dashboard] Falha ao carregar:', err);
    setStatus('Não foi possível carregar os dados. Verifique a conexão.', true);
    renderVazio('Erro ao carregar. Tente recarregar a página.');
  }
}

async function buscarTodosEnvios() {
  try {
    const snapshot = await window.firebase.firestore().collection('envios_atestados').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    if (!erroPermissaoFirestore(err)) throw err;
    const backendUrl = resolverBackendUrl();
    if (!backendUrl) throw new Error('Sem acesso ao Firestore e backend não configurado.');
    const resp = await fetch(`${backendUrl}/api/envios?limit=10000`);
    if (!resp.ok) throw new Error(`Backend retornou ${resp.status}`);
    const dados = await resp.json();
    return Array.isArray(dados) ? dados : [];
  }
}

function erroPermissaoFirestore(error) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return texto.includes('permission-denied') || texto.includes('missing or insufficient permissions');
}

function resolverBackendUrl() {
  const configurado = String(localStorage.getItem('rh_backend_url') || '').trim();
  if (configurado) return configurado.replace(/\/+$/, '');
  if (window.__RH_BACKEND_URL__) return String(window.__RH_BACKEND_URL__).trim().replace(/\/+$/, '');
  return DEFAULT_REMOTE_BACKEND_URL;
}

/* ─── Período ────────────────────────────────────────────── */
function reaplicarPeriodo() {
  const usandoRange = periodoDataDe || periodoDataAte;

  if (usandoRange) {
    // Filtro por range de datas personalizado (criado_em)
    todosAtestados = todosAtestadosBrutos.filter(doc => {
      const data = String(doc.criado_em || '').substring(0, 10);
      if (periodoDataDe  && data < periodoDataDe)  return false;
      if (periodoDataAte && data > periodoDataAte) return false;
      return true;
    });
  } else if (periodoDias > 0) {
    const corte = new Date();
    corte.setDate(corte.getDate() - periodoDias);
    const corteISO = corte.toISOString();
    todosAtestados = todosAtestadosBrutos.filter(doc =>
      String(doc.criado_em || '') >= corteISO
    );
  } else {
    todosAtestados = todosAtestadosBrutos.slice();
  }

  // Atualiza destaque do container de datas
  const customWrap = document.querySelector('.dash-periodo-custom');
  if (customWrap) customWrap.classList.toggle('periodo-custom--ativo', !!usandoRange);

  popularFiltrosDinamicos(todosAtestados);
  aplicarFiltrosERenderizar();
}

function descreverPeriodo() {
  if (periodoDataDe || periodoDataAte) {
    const de  = periodoDataDe  ? new Date(periodoDataDe  + 'T12:00:00').toLocaleDateString('pt-BR') : 'início';
    const ate = periodoDataAte ? new Date(periodoDataAte + 'T12:00:00').toLocaleDateString('pt-BR') : 'hoje';
    return `${de} até ${ate}`;
  }
  if (periodoDias === 0)   return 'Todos os registros';
  if (periodoDias === 365) return 'Últimos 12 meses';
  return `Últimos ${periodoDias} dias`;
}

/* ─── Multi-tenant: correspondência de projeto ──────────── */
function correspondeProjeto(valorCampo, codigo) {
  const valorRaw = String(valorCampo || '').trim();
  if (!valorRaw) return false;
  const valorNorm = normalizarTexto(valorRaw);
  const termos    = obterTermosProjeto(codigo);
  return termos.some(termo => {
    const termoRaw = String(termo || '').trim();
    if (!termoRaw) return false;
    if (/^\d+$/.test(termoRaw)) return new RegExp(`\\b${termoRaw}\\b`).test(valorRaw);
    return valorNorm.includes(normalizarTexto(termoRaw));
  });
}

function obterTermosProjeto(codigo) {
  const termos = [String(codigo || '').trim()];
  if (String(codigo || '').trim() === '744') {
    termos.push('Apoio Macaé', 'Apoio Macae', 'Base de apoio');
  }
  return [...new Set(termos.filter(Boolean))];
}

function normalizarTexto(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function montarTituloProjeto(codigo) {
  if (codigo === '744') return 'Apoio Macaé';
  return /^\d+$/.test(codigo) ? `Projeto ${codigo}` : codigo;
}

/* ─── Filtros ────────────────────────────────────────────── */
function aplicarFiltrosERenderizar() {
  const cargo   = document.getElementById('filtroCargo').value;
  const tipo    = document.getElementById('filtroTipo').value;
  const status  = document.getElementById('filtroStatus').value;
  const dataDe  = document.getElementById('filtroDataDe').value;
  const dataAte = document.getElementById('filtroDataAte').value;

  dadosFiltrados = todosAtestados.filter(doc => {
    if (cargo  && doc.funcao !== cargo)                              return false;
    if (tipo   && doc.tipo_atestado !== tipo)                        return false;
    if (status && (doc.atendimento_status || 'pendente') !== status) return false;
    if (dataDe  && String(doc.data_inicio || '') < dataDe)           return false;
    if (dataAte && String(doc.data_inicio || '') > dataAte)          return false;
    return true;
  });

  const n = [cargo, tipo, status, dataDe, dataAte].filter(Boolean).length;
  const badge = document.getElementById('filtrosBadge');
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);

  renderizarTudo(dadosFiltrados);
}

function popularFiltrosDinamicos(docs) {
  const cargos = [...new Set(docs.map(d => d.funcao).filter(Boolean))].sort();
  const tipos  = [...new Set(docs.map(d => d.tipo_atestado).filter(Boolean))].sort();
  preencherSelect('filtroCargo', cargos, 'Todos');
  preencherSelect('filtroTipo',  tipos,  'Todos');
}

function preencherSelect(id, opcoes, placeholder) {
  const el = document.getElementById(id);
  const valorAtual = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>` +
    opcoes.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  el.value = valorAtual;
}

/* ─── Renderização central ───────────────────────────────── */
function renderizarTudo(docs) {
  const metricas = calcularMetricas(docs);
  atualizarKPIs(metricas);
  renderizarGraficos(docs);
  rankingGlobal = construirRanking(docs);
  paginaAtual   = 1;
  renderizarTabela();
}

/* ─── KPIs ───────────────────────────────────────────────── */
function calcularMetricas(docs) {
  const total      = docs.length;
  const totalDias  = docs.reduce((s, d) => s + (Number(d.dias) || 0), 0);
  const colabores  = [...new Set(docs.map(d => d.nome).filter(Boolean))];
  const nColabores = colabores.length;
  const media      = nColabores > 0 ? (total / nColabores).toFixed(1) : '0.0';

  const contagem = {};
  docs.forEach(d => { if (d.nome) contagem[d.nome] = (contagem[d.nome] || 0) + 1; });
  const maisAusente = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  return { total, totalDias, media, nColabores, maisAusente };
}

function atualizarKPIs({ total, totalDias, media, nColabores, maisAusente }) {
  animar('kpiTotalAtestados', String(total));
  animar('kpiTotalDias',      String(totalDias));
  animar('kpiMedia',          media);
  animar('kpiMaisAusente',    maisAusente[0] || '—');

  document.getElementById('kpiTotalSub').textContent =
    `${nColabores} colaborador${nColabores !== 1 ? 'es' : ''} no período`;
  document.getElementById('kpiMaisAusenteSub').textContent =
    maisAusente[1] > 0
      ? `${maisAusente[1]} atestado${maisAusente[1] !== 1 ? 's' : ''}`
      : 'sem dados';
}

function animar(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.textContent = valor;
  el.style.animation = '';
}

/* ─── Gráficos ───────────────────────────────────────────── */
Chart.defaults.font.family = "'DM Mono', ui-monospace, monospace";
Chart.defaults.color = '#4f7460';

function renderizarGraficos(docs) {
  renderBarras(docs);
  renderLinha(docs);
  renderRosca(docs);
  renderHeatmap(docs);
}

function renderBarras(docs) {
  const ranking = construirRanking(docs).slice(0, 10);
  const ctx = document.getElementById('chartBar');
  if (!ctx) return;
  if (instanciaBar) instanciaBar.destroy();
  instanciaBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ranking.map(r => truncar(r.nome, 18)),
      datasets: [{
        label: 'Dias afastados',
        data: ranking.map(r => r.dias),
        backgroundColor: ranking.map((_, i) => `rgba(47,168,79,${1 - i * 0.07})`),
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.raw} dia${c.raw !== 1 ? 's' : ''} afastado${c.raw !== 1 ? 's' : ''}` } }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderLinha(docs) {
  const porMes = {};
  docs.forEach(doc => {
    const chave = String(doc.criado_em || '').substring(0, 7);
    if (chave.length === 7) porMes[chave] = (porMes[chave] || 0) + 1;
  });
  const meses  = Object.keys(porMes).sort();
  const labels = meses.map(m => {
    const [a, mo] = m.split('-');
    return new Date(Number(a), Number(mo) - 1)
      .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  });
  const ctx = document.getElementById('chartLine');
  if (!ctx) return;
  if (instanciaLine) instanciaLine.destroy();
  instanciaLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Atestados',
        data: meses.map(m => porMes[m]),
        borderColor: '#5fbe4a',
        backgroundColor: 'rgba(95,190,74,0.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#5fbe4a',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.38,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.raw} atestado${c.raw !== 1 ? 's' : ''}` } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { precision: 0 } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderRosca(docs) {
  const porTipo = {};
  docs.forEach(d => {
    const t = String(d.tipo_atestado || 'Não informado').trim();
    porTipo[t] = (porTipo[t] || 0) + 1;
  });
  const entradas = Object.entries(porTipo).sort((a, b) => b[1] - a[1]);
  const ctx = document.getElementById('chartDonut');
  if (!ctx) return;
  if (instanciaDonut) instanciaDonut.destroy();
  instanciaDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entradas.map(([k]) => truncar(k, 24)),
      datasets: [{
        data: entradas.map(([, v]) => v),
        backgroundColor: CHART_CORES.slice(0, entradas.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, padding: 10, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: c => docs.length > 0
              ? ` ${c.raw} (${((c.raw / docs.length) * 100).toFixed(1)}%)`
              : ` ${c.raw}`
          }
        }
      }
    }
  });
}

function renderHeatmap(docs) {
  const wrap = document.getElementById('heatmapWrap');
  if (!wrap) return;

  const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const contagem  = {};

  docs.forEach(doc => {
    if (!doc.data_inicio) return;
    try {
      const dt  = new Date(doc.data_inicio + 'T12:00:00');
      const mes = doc.data_inicio.substring(0, 7);
      const dia = dt.getDay();
      if (!contagem[mes]) contagem[mes] = new Array(7).fill(0);
      contagem[mes][dia]++;
    } catch { /* ignora datas inválidas */ }
  });

  const meses = Object.keys(contagem).sort().slice(-12);
  if (meses.length === 0) {
    wrap.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:28px 0;font-size:0.78rem;">Dados insuficientes para o heatmap.</p>';
    return;
  }

  const maxVal = Math.max(...meses.flatMap(m => contagem[m]), 1);
  let html = `<div class="heatmap-header"><span></span>${NOMES_DIA.map(d => `<span>${d}</span>`).join('')}</div>`;

  meses.forEach(mes => {
    const [a, m] = mes.split('-');
    const label  = new Date(Number(a), Number(m) - 1)
      .toLocaleDateString('pt-BR', { month: 'short' });
    html += `<div class="heatmap-linha"><span class="heatmap-mes-label">${label}</span>`;
    NOMES_DIA.forEach((_d, dia) => {
      const n     = contagem[mes][dia] || 0;
      const nivel = n === 0 ? 0 : Math.max(1, Math.ceil((n / maxVal) * 5));
      html += `<div class="heatmap-celula" data-n="${nivel}" title="${label} / ${NOMES_DIA[dia]}: ${n} atestado${n !== 1 ? 's' : ''}"></div>`;
    });
    html += '</div>';
  });

  wrap.innerHTML = html;
}

/* ─── Ranking / Tabela ───────────────────────────────────── */
function construirRanking(docs) {
  const mapa = {};
  docs.forEach(doc => {
    const nome = String(doc.nome || 'Sem nome').trim();
    if (!mapa[nome]) {
      mapa[nome] = { nome, cargo: String(doc.funcao || '—'), qtd: 0, dias: 0, ultimo: '', meses: new Set(), feitos: 0 };
    }
    const r = mapa[nome];
    r.qtd++;
    r.dias += Number(doc.dias) || 0;
    const criadoEm = String(doc.criado_em || '');
    if (criadoEm && (!r.ultimo || criadoEm > r.ultimo)) r.ultimo = criadoEm;
    if (criadoEm.length >= 7) r.meses.add(criadoEm.substring(0, 7));
    if ((doc.atendimento_status || '') === 'feito') r.feitos++;
  });

  return Object.values(mapa)
    .map(r => ({
      ...r,
      freqMensal: r.meses.size > 0 ? (r.qtd / r.meses.size).toFixed(1) : r.qtd.toFixed(1),
      statusDom:  r.feitos / r.qtd >= 0.5 ? 'feito' : 'pendente'
    }))
    .sort(comparador);
}

function comparador(a, b) {
  const campo = sortCol === 'nome' ? 'nome' : sortCol === 'dias' ? 'dias' : 'qtd';
  const va = a[campo], vb = b[campo];
  if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  return sortDir === 'asc' ? va - vb : vb - va;
}

function renderizarTabela() {
  const busca    = normalizarTexto(rankingBusca);
  const filtrado = busca
    ? rankingGlobal.filter(r =>
        normalizarTexto(r.nome).includes(busca) || normalizarTexto(r.cargo).includes(busca))
    : rankingGlobal;

  const total   = filtrado.length;
  const totalPg = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
  if (paginaAtual > totalPg) paginaAtual = totalPg;

  const inicio  = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const pagina  = filtrado.slice(inicio, inicio + ITENS_POR_PAGINA);
  const maxFreq = Math.max(...rankingGlobal.map(r => parseFloat(r.freqMensal)), 0.1);

  document.getElementById('tabelaTotal').textContent = `${total} colaborador${total !== 1 ? 'es' : ''}`;
  document.getElementById('pagInfo').textContent     = `Página ${paginaAtual} de ${totalPg}`;
  document.getElementById('pagAnterior').disabled    = paginaAtual <= 1;
  document.getElementById('pagProximo').disabled     = paginaAtual >= totalPg;

  if (pagina.length === 0) { renderVazio('Nenhum colaborador encontrado.'); return; }

  document.getElementById('tabelaCorpo').innerHTML = pagina.map((r, i) => {
    const pos     = inicio + i + 1;
    const freqPct = Math.min(100, (parseFloat(r.freqMensal) / maxFreq) * 100).toFixed(0);
    return `<tr>
      <td class="th-rank"><span class="rank-badge" data-pos="${pos <= 3 ? pos : ''}">${pos}</span></td>
      <td class="td-nome">${esc(r.nome)}</td>
      <td>${esc(r.cargo)}</td>
      <td class="td-qtd">${r.qtd}</td>
      <td class="td-dias">${r.dias}</td>
      <td>${r.ultimo ? formatarData(r.ultimo) : '—'}</td>
      <td>
        <div class="freq-wrap">
          <div class="freq-barra"><div class="freq-fill" style="width:${freqPct}%"></div></div>
          <span class="freq-texto">${r.freqMensal}/mês</span>
        </div>
      </td>
      <td><span class="status-pill status-pill--${r.statusDom}">${r.statusDom === 'feito' ? 'Atendido' : 'Pendente'}</span></td>
    </tr>`;
  }).join('');
}

function renderCarregando() {
  document.getElementById('tabelaCorpo').innerHTML =
    '<tr><td colspan="8" class="td-carregando"><span class="loading-dots"><span></span><span></span><span></span></span></td></tr>';
}

function renderVazio(msg) {
  document.getElementById('tabelaCorpo').innerHTML =
    `<tr><td colspan="8" class="td-vazio">${esc(msg)}</td></tr>`;
}

/* ─── Exportar CSV ───────────────────────────────────────── */
function exportarCSV() {
  if (!dadosFiltrados.length) { setStatus('Sem dados para exportar.', true); return; }

  const cabecalho = ['Nome','Cargo','Projeto','Tipo','Data Início','Data Fim','Dias','Enviado em','Status'];
  const linhas    = dadosFiltrados.map(d => [
    d.nome, d.funcao, d.projeto, d.tipo_atestado,
    d.data_inicio, d.data_fim, d.dias, d.criado_em,
    d.atendimento_status || 'pendente'
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

  const csv  = [cabecalho.join(','), ...linhas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `atestados_${codigoProjeto}_${new Date().toISOString().substring(0, 10)}.csv`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus(`CSV exportado com ${dadosFiltrados.length} registro${dadosFiltrados.length !== 1 ? 's' : ''}.`);
}

/* ─── Exportar PDF ───────────────────────────────────────── */
function exportarPDF() {
  if (!rankingGlobal.length) { setStatus('Sem dados para exportar.', true); return; }
  if (!window.jspdf) { setStatus('Biblioteca PDF não carregou. Tente recarregar a página.', true); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const VERDE   = [22, 63, 42];   // #163f2a
  const VERDE2  = [47, 158, 87];  // #2f9e57
  const CINZA   = [100, 120, 110];
  const W       = doc.internal.pageSize.width;

  // ── Cabeçalho ──
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, W, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Relatório de Atestados — ${tituloProjeto}`, 14, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Período: ${descreverPeriodo()}`, 14, 17);
  const agora = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Gerado em: ${agora}`, W - 14, 17, { align: 'right' });

  // ── KPIs ──
  const metricas = calcularMetricas(dadosFiltrados);
  const kpis = [
    { rotulo: 'Total de Atestados', valor: String(metricas.total) },
    { rotulo: 'Dias Afastados',     valor: String(metricas.totalDias) },
    { rotulo: 'Média / Colaborador',valor: metricas.media },
    { rotulo: 'Mais Ausente',       valor: metricas.maisAusente[0] || '—' },
  ];
  const kpiW  = (W - 28) / kpis.length;
  const kpiY  = 28;
  kpis.forEach((k, i) => {
    const x = 14 + i * kpiW;
    doc.setDrawColor(220, 230, 225);
    doc.setFillColor(247, 249, 248);
    doc.roundedRect(x, kpiY, kpiW - 4, 20, 2, 2, 'FD');
    doc.setTextColor(...CINZA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(k.rotulo.toUpperCase(), x + 4, kpiY + 6);
    doc.setTextColor(...VERDE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(k.valor.length > 12 ? 9 : 13);
    doc.text(k.valor, x + 4, kpiY + 16);
  });

  // ── Tabela de ranking (todos os dados, sem paginação) ──
  const ranking = construirRanking(dadosFiltrados);

  doc.autoTable({
    startY: kpiY + 24,
    head: [['#', 'Colaborador', 'Cargo', 'Atestados', 'Dias Afastados', 'Último Envio', 'Freq./Mês', 'Status']],
    body: ranking.map((r, i) => [
      i + 1,
      r.nome,
      r.cargo,
      r.qtd,
      r.dias,
      r.ultimo ? formatarData(r.ultimo) : '—',
      `${r.freqMensal}/mês`,
      r.statusDom === 'feito' ? 'Atendido' : 'Pendente'
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: VERDE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [247, 249, 248] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 28 },
      5: { cellWidth: 28 },
      6: { cellWidth: 24, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 7) {
        data.cell.styles.textColor =
          data.cell.raw === 'Atendido' ? [22, 163, 74] : [180, 83, 9];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ── Rodapé em todas as páginas ──
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 180, 170);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Normatel Engenharia — Sistema de RH  •  Página ${p} de ${totalPaginas}`,
      14,
      doc.internal.pageSize.height - 6
    );
    doc.text(
      tituloProjeto,
      W - 14,
      doc.internal.pageSize.height - 6,
      { align: 'right' }
    );
  }

  doc.save(`relatorio_atestados_${codigoProjeto}_${new Date().toISOString().substring(0, 10)}.pdf`);
  setStatus(`PDF exportado com ${ranking.length} colaborador${ranking.length !== 1 ? 'es' : ''}.`);
}

/* ─── Eventos ────────────────────────────────────────────── */
function registrarEventos() {
  document.getElementById('voltarBtn').addEventListener('click', () => {
    history.length > 1 ? history.back() : (window.location.href = 'rh-atestados.html');
  });

  document.getElementById('exportarCsvBtn').addEventListener('click', exportarCSV);
  document.getElementById('exportarPdfBtn').addEventListener('click', exportarPDF);

  // Período — apenas re-filtra o cache local, sem nova query ao Firestore
  document.querySelectorAll('.periodo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('periodo-btn--ativo'));
      btn.classList.add('periodo-btn--ativo');
      periodoDias = Number(btn.dataset.dias);

      // Limpa as datas personalizadas ao clicar num botão de período
      periodoDataDe  = '';
      periodoDataAte = '';
      const inpDe  = document.getElementById('periodoDataDe');
      const inpAte = document.getElementById('periodoDataAte');
      if (inpDe)  inpDe.value  = '';
      if (inpAte) inpAte.value = '';

      reaplicarPeriodo();
    });
  });

  // Datas personalizadas — quando preenchidas, desmarcam os botões de período
  const inpDe  = document.getElementById('periodoDataDe');
  const inpAte = document.getElementById('periodoDataAte');

  function aoMudarData() {
    periodoDataDe  = inpDe  ? inpDe.value  : '';
    periodoDataAte = inpAte ? inpAte.value : '';
    if (periodoDataDe || periodoDataAte) {
      document.querySelectorAll('.periodo-btn').forEach(b => b.classList.remove('periodo-btn--ativo'));
    }
    reaplicarPeriodo();
  }

  if (inpDe)  inpDe.addEventListener('change',  aoMudarData);
  if (inpAte) inpAte.addEventListener('change', aoMudarData);

  // Filtros toggle
  const toggle = document.getElementById('filtrosToggle');
  const painel = document.getElementById('filtrosPainel');
  toggle.addEventListener('click', () => {
    const aberto = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!aberto));
    painel.classList.toggle('hidden', aberto);
  });

  document.getElementById('aplicarFiltrosBtn').addEventListener('click', aplicarFiltrosERenderizar);
  document.getElementById('limparFiltrosBtn').addEventListener('click', () => {
    ['filtroCargo','filtroTipo','filtroStatus','filtroDataDe','filtroDataAte']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    aplicarFiltrosERenderizar();
  });

  // Busca na tabela
  document.getElementById('buscaColab').addEventListener('input', e => {
    rankingBusca = e.target.value.trim();
    paginaAtual  = 1;
    renderizarTabela();
  });

  // Paginação
  document.getElementById('pagAnterior').addEventListener('click', () => { paginaAtual--; renderizarTabela(); });
  document.getElementById('pagProximo').addEventListener('click',  () => { paginaAtual++; renderizarTabela(); });

  // Ordenação
  document.querySelectorAll('.th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      sortDir = sortCol === col && sortDir === 'desc' ? 'asc' : 'desc';
      sortCol = col;
      document.querySelectorAll('.th-sort').forEach(t => {
        t.classList.remove('th-sort--ativo');
        t.querySelector('.sort-seta').textContent = '↕';
      });
      th.classList.add('th-sort--ativo');
      th.querySelector('.sort-seta').textContent = sortDir === 'desc' ? '↓' : '↑';
      rankingGlobal = construirRanking(dadosFiltrados);
      paginaAtual   = 1;
      renderizarTabela();
    });
  });
}

/* ─── Helpers ────────────────────────────────────────────── */
function formatarData(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); }
  catch { return String(iso).substring(0, 10); }
}

function truncar(str, max) {
  return str && str.length > max ? str.substring(0, max) + '…' : (str || '');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setStatus(msg, erro = false) {
  const el = document.getElementById('dashStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = erro ? '#ef4444' : '';
}
