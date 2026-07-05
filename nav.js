/**
 * nav.js — Header, navegación y guardia de sesión compartidos.
 * Cualquier página que requiera login incluye:
 *   <div id="nav-placeholder"></div>
 *   <script src="nav.js"></script>
 *   <script>iniciarPagina({ paginaAtiva: 'dashboard_painel_diario.html', mostrarAbas: true });</script>
 */

const APPSCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyB1-iOU9RsH4k1jRPFGyvHOah_H5tlIa3VixAep13B4JrgeXpRaZujMoA5CROWQEpazg/exec';
const NOME_PROJETO = 'Rumo aos 200.000';

const ABAS_BOLETIM = [
  { href: 'dashboard_painel_diario.html', label: 'Painel Diário' },
  { href: 'curva_resultado.html', label: 'Curva de Resultado &amp; Risco' },
  { href: 'segmentacao_temporal.html', label: 'Segmentação Temporal' },
  { href: 'direcao_instrumento.html', label: 'Direção &amp; Instrumento' },
  { href: 'volume_contratos.html', label: 'Volume &amp; Contratos' },
  { href: 'registro_operacoes.html', label: 'Registro de Operações' }
];

function requireAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'index.html';
    return null;
  }
  return {
    token: token,
    nome: localStorage.getItem('nome') || '',
    rol: localStorage.getItem('rol') || 'trader',
    // Requer que index.html salve este valor no localStorage após o login
    // (localStorage.setItem('acessoAnalise', data.acessoAnalise)). Enquanto essa
    // linha não for adicionada em index.html, o padrão é 'Não' — seguro por design.
    acessoAnalise: localStorage.getItem('acessoAnalise') || 'Não'
  };
}

function logout(e) {
  if (e) e.preventDefault();
  localStorage.clear();
  window.location.href = 'index.html';
}

function renderHeader(opts) {
  const sessao = requireAuth();
  if (!sessao) return null;

  if (opts.somenteAdmin && sessao.rol !== 'admin') {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;">Acesso restrito a administradores.</p>';
    return null;
  }

  const placeholder = document.getElementById('nav-placeholder');
  if (!placeholder) return sessao;

  let html = '';
  html += '<header class="membrete">';
  html += '<div>';
  html += '<div class="membrete-eyebrow">' + (opts.eyebrow || 'Boletim de Operações') + '</div>';
  html += '<a class="membrete-marca" href="portal.html">' + NOME_PROJETO + '</a>';
  html += '</div>';
  html += '<div class="membrete-meta">';
  html += 'Logado como <strong>' + sessao.nome + '</strong>';
  if (sessao.rol === 'admin') html += ' · <a href="painel_admin.html" style="color:var(--tinta-suave);">Painel Admin</a>';
  html += ' · <a href="portal.html" style="color:var(--tinta-suave);">Portal</a>';
  html += ' · <a href="#" onclick="logout(event)" style="color:var(--tinta-suave);">Sair</a>';
  html += '</div>';
  html += '</header>';

  if (opts.mostrarAbas) {
    html += '<nav class="abas">';
    ABAS_BOLETIM.forEach(function (aba) {
      const ativa = aba.href === opts.paginaAtiva ? ' ativa' : '';
      html += '<a class="aba' + ativa + '" href="' + aba.href + '">' + aba.label + '</a>';
    });
    html += '</nav>';
  }

  placeholder.outerHTML = html;
  return sessao;
}

function iniciarPagina(opts) {
  return renderHeader(opts || {});
}
