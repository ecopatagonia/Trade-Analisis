/**
 * test_diaadia.js — Integración jsdom de analise_diaadia.html contra backend simulado.
 * Fecha del entorno: julio 2026 (el calendario abre en el mes local actual).
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let nOK = 0, nFail = 0;
function check(nome, cond, det) {
  if (cond) { nOK++; console.log('  ✓ ' + nome); }
  else { nFail++; console.log('  ✗ ' + nome + (det !== undefined ? ' — ' + JSON.stringify(det) : '')); }
}

/* ---------- Datos simulados ---------- */

function iso(y, m, d, hh, mm) { return new Date(y, m - 1, d, hh, mm, 0).toISOString(); }

const TRADES = [
  // 2026-07-02: respeta todo, resultado +100 (perda_max 4000, contratos_max 10)
  { Fecha: iso(2026,7,2,10,0),  'Resultado_R$': 200,  Cantidad: 5,  Contrato: 'WINQ26', Direccion: 'Long' },
  { Fecha: iso(2026,7,2,11,0),  'Resultado_R$': -100, Cantidad: 8,  Contrato: 'WINQ26', Direccion: 'Short' },
  // 2026-07-03: viola contratos (15 > 10), resultado -800
  { Fecha: iso(2026,7,3,10,0),  'Resultado_R$': -300, Cantidad: 15, Contrato: 'WINQ26', Direccion: 'Long' },
  { Fecha: iso(2026,7,3,11,0),  'Resultado_R$': -500, Cantidad: 8,  Contrato: 'WINQ26', Direccion: 'Long' },
  // 2026-07-08: día con trades pero diário só-pré (no analizable)
  { Fecha: iso(2026,7,8,10,0),  'Resultado_R$': 50,   Cantidad: 2,  Contrato: 'WINQ26', Direccion: 'Long' },
  // 2026-06-15: junio, día completo con trades, respeta todo
  { Fecha: iso(2026,6,15,10,0), 'Resultado_R$': 400,  Cantidad: 3,  Contrato: 'WINM26', Direccion: 'Long' }
];

const REGISTROS = {
  '2026-07-02': { Fecha: '2026-07-02', Perda_Max: 4000, Contratos_Max: 10, Meta_Dia: 1500, Efeito_Ontem: 'neutro', Ansiedade: 2, Obs_Pre: '',
    Arquetipo: 'estrategista', Resp_PerdaMax: 'Sim', Resp_Contratos: 'Sim', Riscos_Desnec: 'Não', Satisfacao: 'satisfeito',
    Obs_Pos: 'Nada — dia lento, operei pouco de propósito.', Data_Pre: iso(2026,7,2,9,0), Data_Pos: iso(2026,7,2,18,0), temPre: true, temPos: true },
  '2026-07-03': { Fecha: '2026-07-03', Perda_Max: 1000, Contratos_Max: 10, Meta_Dia: 1500, Efeito_Ontem: 'recuperar', Ansiedade: 4, Obs_Pre: '',
    Arquetipo: 'vingador', Resp_PerdaMax: 'Sim', Resp_Contratos: 'Sim', Riscos_Desnec: 'Sim', Satisfacao: 'insatisfeito',
    Obs_Pos: '', Data_Pre: iso(2026,7,3,9,0), Data_Pos: iso(2026,7,3,18,0), temPre: true, temPos: true },
  '2026-06-15': { Fecha: '2026-06-15', Perda_Max: 2000, Contratos_Max: 10, Meta_Dia: 500, Efeito_Ontem: 'neutro', Ansiedade: 1, Obs_Pre: '',
    Arquetipo: 'estrategista', Resp_PerdaMax: 'Sim', Resp_Contratos: 'Sim', Riscos_Desnec: 'Não', Satisfacao: 'satisfeito',
    Obs_Pos: '', Data_Pre: iso(2026,6,15,9,0), Data_Pos: iso(2026,6,15,18,0), temPre: true, temPos: true }
};

const DIAS_MES = {
  '2026-07': [
    { fecha: '2026-07-02', pre: true, pos: true, completo: true, tem_trades: true, perda_max: 4000, contratos_max: 10, meta_dia: 1500 },
    { fecha: '2026-07-03', pre: true, pos: true, completo: true, tem_trades: true, perda_max: 1000, contratos_max: 10, meta_dia: 1500 },
    { fecha: '2026-07-06', pre: true, pos: true, completo: true, tem_trades: false, perda_max: 3000, contratos_max: 10, meta_dia: 1000 },
    { fecha: '2026-07-08', pre: true, pos: false, completo: false, tem_trades: true, perda_max: 3000, contratos_max: 10, meta_dia: 1000 }
  ],
  '2026-06': [
    { fecha: '2026-06-15', pre: true, pos: true, completo: true, tem_trades: true, perda_max: 2000, contratos_max: 10, meta_dia: 500 }
  ]
};

function criarBackend(comPerfil) {
  return {
    async fetch(url) {
      const params = Object.fromEntries(new URL(url).searchParams.entries());
      let out;
      if (params.action === 'diario_estado') {
        out = { ok: true, fecha: params.fecha,
                perfil: comPerfil ? { Fraqueza_Principal: 'apostador' } : null,
                registro: REGISTROS[params.fecha] || null };
      } else if (params.action === 'trades') {
        out = { ok: true, trades: TRADES };
      } else if (params.action === 'diario_dias') {
        out = { ok: true, mes: params.mes, dias: DIAS_MES[params.mes] || [] };
      } else {
        out = { ok: false, error: 'Ação inválida.' };
      }
      return { json: async () => out };
    }
  };
}

/* ---------- Montaje ---------- */

async function montarPagina(backend) {
  const statsJs = fs.readFileSync('/mnt/project/stats.js', 'utf8');
  const html = fs.readFileSync('/home/claude/diario/analise_diaadia.html', 'utf8')
    .replace('<script src="nav.js"></script>', '')
    .replace('<script src="stats.js"></script>', () => '<script>' + statsJs + '</scr' + 'ipt>');
  const vc = new VirtualConsole(); // silenciar "not implemented: navigation" del redirect
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://ecopatagonia.github.io/Trade-Analisis/analise_diaadia.html',
    virtualConsole: vc,
    beforeParse(window) {
      window.APPSCRIPT_URL = 'https://script.test/exec';
      window.iniciarPagina = () => ({ token: 'tok-test', nome: 'MAURO', rol: 'admin' });
      window.fetch = (url, opts) => backend.fetch(url, opts);
      window.scrollTo = () => {};
    }
  });
  await new Promise(r => setTimeout(r, 50));
  return dom.window;
}

function celda(w, fecha) { return w.document.querySelector('.cal-dia[data-fecha="' + fecha + '"]'); }
function texto(w, id) { return w.document.getElementById(id).textContent; }

(async function main() {

  console.log('\n== A. Guardia sin perfil ==');
  let w = await montarPagina(criarBackend(false));
  check('sin perfil: el contenido no se muestra (redirect al onboarding)', w.document.getElementById('conteudo').style.display === 'none');

  console.log('\n== B. Calendario del mes actual (julho 2026) ==');
  w = await montarPagina(criarBackend(true));
  check('título del mes', texto(w, 'cal-titulo') === 'Julho 2026', texto(w, 'cal-titulo'));
  check('botón mes siguiente deshabilitado (no hay futuro)', w.document.getElementById('btn-mes-seg').disabled === true);
  check('contador: 2 dias completos em julho', texto(w, 'n-completos') === '2 dias completos em julho', texto(w, 'n-completos'));

  const c2 = celda(w, '2026-07-02'), c3 = celda(w, '2026-07-03');
  check('02/07 verde (plano respeitado) con punto positivo', c2 && c2.classList.contains('dia-ok') && c2.querySelector('.ponto.pos') !== null);
  check('03/07 rojo (contratos violados) con punto negativo', c3 && c3.classList.contains('dia-violado') && c3.querySelector('.ponto.neg') !== null);
  check('06/07 (completo sin CSV) NO clickeable', celda(w, '2026-07-06') === null);
  check('08/07 (só-pré con CSV) NO clickeable', celda(w, '2026-07-08') === null);

  console.log('\n== C. Tarjeta auto-seleccionada (03/07, el más reciente) ==');
  check('día 03 seleccionado en el calendario', c3.classList.contains('selecionado'));
  check('encabezado con día de la semana', texto(w, 'cartao-data').indexOf('03/07/2026') !== -1 && /Sexta/.test(texto(w, 'cartao-data')), texto(w, 'cartao-data'));
  check('carimbo: O VINGADOR declarado', texto(w, 'carimbo-circulo') === 'O VINGADOR' && texto(w, 'carimbo-titulo') === 'Você declarou: O Vingador');
  check('sub del carimbo: insatisfeito + riscos declarados', texto(w, 'carimbo-sub').indexOf('Insatisfeito') !== -1 && texto(w, 'carimbo-sub').indexOf('Correu riscos') !== -1, texto(w, 'carimbo-sub'));
  check('resultado del día: − R$ 800,00 · 2 operações', texto(w, 'val-resultado') === '− R$ 800,00 · 2 operações', texto(w, 'val-resultado'));
  check('perda: declaró "respeitei" y CSV confirma (mín −800 ≥ −1000)', texto(w, 'val-perda') === 'CSV confirma ✓', texto(w, 'val-perda'));
  check('contratos: CSV contradiz — máx. real 15 ✗', texto(w, 'val-contratos') === 'CSV contradiz: máx. real 15 ✗', texto(w, 'val-contratos'));
  check('meta: dia negativo', texto(w, 'val-meta') === 'dia negativo');
  check('ansiedade: 4 · Alta', texto(w, 'val-ansiedade') === '4 · Alta');
  check('obs vacía → "—"', texto(w, 'val-obs') === '—');

  console.log('\n== D. Click en 02/07 (plan respetado) ==');
  await w.selecionarDia('2026-07-02');
  await new Promise(r => setTimeout(r, 20));
  check('carimbo: O ESTRA-TEGISTA', texto(w, 'carimbo-circulo') === 'O ESTRA-TEGISTA');
  check('resultado + R$ 100,00 en verde', texto(w, 'val-resultado') === '+ R$ 100,00 · 2 operações');
  check('perda: CSV confirma ✓', texto(w, 'val-perda') === 'CSV confirma ✓');
  check('contratos: máx. real 8 ✓', texto(w, 'val-contratos') === 'máx. real 8 ✓', texto(w, 'val-contratos'));
  check('meta 1500 con +100 → atingiu 7%', texto(w, 'val-meta') === 'atingiu 7%', texto(w, 'val-meta'));
  check('obs entre comillas', texto(w, 'val-obs') === '"Nada — dia lento, operei pouco de propósito."');
  check('rot de perda muestra lo declarado', texto(w, 'rot-perda').indexOf('declarou −') !== -1 && texto(w, 'rot-perda').indexOf('respeitei') !== -1, texto(w, 'rot-perda'));

  console.log('\n== E. Navegación de meses ==');
  await w.mudarMes(-1);
  await new Promise(r => setTimeout(r, 30));
  check('← junho: título correcto', texto(w, 'cal-titulo') === 'Junho 2026');
  check('junho: 1 dia completo', texto(w, 'n-completos') === '1 dia completo em junho', texto(w, 'n-completos'));
  const c15 = celda(w, '2026-06-15');
  check('15/06 verde con punto positivo, auto-seleccionado', c15 && c15.classList.contains('dia-ok') && c15.classList.contains('selecionado'));
  check('meta 500 con +400 → atingiu 80%', texto(w, 'val-meta') === 'atingiu 80%', texto(w, 'val-meta'));
  check('botón siguiente habilitado en mes pasado', w.document.getElementById('btn-mes-seg').disabled === false);
  await w.mudarMes(1);
  await new Promise(r => setTimeout(r, 30));
  check('→ vuelve a julho (cache del mes)', texto(w, 'cal-titulo') === 'Julho 2026');

  console.log('\n== F. Mes sin datos ==');
  await w.mudarMes(-2); // maio 2026
  await new Promise(r => setTimeout(r, 30));
  check('maio vacío: mensaje en la tarjeta', texto(w, 'cal-titulo') === 'Maio 2026' && texto(w, 'vazio-cartao').indexOf('Nenhum dia') !== -1, texto(w, 'vazio-cartao'));
  check('contador en cero', texto(w, 'n-completos') === '0 dias completos em maio');

  console.log(`\n===== RESULTADO: ${nOK} OK / ${nFail} FALLOS =====\n`);
  process.exit(nFail > 0 ? 1 : 0);
})();
