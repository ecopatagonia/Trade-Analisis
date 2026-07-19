/**
 * test_performance.js — Integración jsdom de analise_performance.html.
 * Dataset A: 12 días completos → secciones tempranas + candados con progreso.
 * Dataset B: 32 días completos con valores conocidos → todas las secciones 30 abiertas,
 *            valores verificados a mano, contraste sigue bloqueado (32 de 90).
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let nOK = 0, nFail = 0;
function check(nome, cond, det) {
  if (cond) { nOK++; console.log('  ✓ ' + nome); }
  else { nFail++; console.log('  ✗ ' + nome + (det !== undefined ? ' — ' + JSON.stringify(det) : '')); }
}

function iso(y, m, d, hh, mm) { return new Date(y, m - 1, d, hh, mm || 0, 0).toISOString(); }
function fkey(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }

/* ---------- Generador del Dataset B (32 días, mayo-junio 2026, días hábiles) ----------
   16 estrategista: [+300,-100] cant 5    → dia +200, pico 300, giveback 100, satisfeito
    2 vingador esp: SOLAPADO — A(-1700, entra 10:00 dura 120min) + B(+1300, entra 10:30 dura 5min)
                    orden por CIERRE: B(10:35)+1300 → A(12:00)=-400 · pico 1300, giveback 1700, insatisfeito
    6 vingador:     [-150,-250] cant 5    → dia -400, pico 0, giveback 400, insatisfeito
    4 apostador:    [+100,+100] cant 15 (viola máx 10) → dia +200, giveback 0, neutro
    4 euforico:     [+50,-50] cant 5      → dia 0, pico 50, giveback 50, neutro
   Declarado siempre: perda 4000, contratos 10, meta 1500, resp_* = 'Sim', riscos 'Não'.
   Esperado: aderência perda conf 32 · contratos conf 28 / contra 4 → calibração 94%
             custo: estrategista +200 (16) · vingador −400 (8) · apostador +200 (4) · euforico 0 (4)
             giveback: mediana 100 · máx 1700 · meta-em-mãos: 2 dias · devolução 3400
             processo (sin 8 neutros): SL 16 · SP 0 · IL 0 · IP 8                          */
function gerarDatasetB() {
  const registros = [], trades = [];
  let count = 0;
  let d = new Date(2026, 4, 4); // lunes 4 de mayo
  const plan = [];
  for (let i = 0; i < 16; i++) plan.push('estrategista');
  plan.push('vingador_esp', 'vingador_esp');
  for (let i = 0; i < 6; i++) plan.push('vingador');
  for (let i = 0; i < 4; i++) plan.push('apostador');
  for (let i = 0; i < 4; i++) plan.push('euforico');

  while (count < 32) {
    if (d.getDay() === 0 || d.getDay() === 6) { d.setDate(d.getDate() + 1); continue; }
    const y = d.getFullYear(), m = d.getMonth() + 1, dia = d.getDate();
    const fecha = fkey(y, m, dia);
    const tipo = plan[count];
    const arq = tipo === 'vingador_esp' ? 'vingador' : tipo;
    const sat = arq === 'estrategista' ? 'satisfeito' : (arq === 'vingador' ? 'insatisfeito' : 'neutro');

    registros.push({ Fecha: fecha, Perda_Max: 4000, Contratos_Max: 10, Meta_Dia: 1500,
      Efeito_Ontem: 'neutro', Ansiedade: 2, Obs_Pre: '', Arquetipo: arq,
      Resp_PerdaMax: 'Sim', Resp_Contratos: 'Sim', Riscos_Desnec: 'Não', Satisfacao: sat,
      Obs_Pos: '', Data_Pre: iso(y, m, dia, 9, 0), Data_Pos: iso(y, m, dia, 18, 0),
      temPre: true, temPos: true });

    if (tipo === 'estrategista') {
      trades.push({ Fecha: iso(y,m,dia,10,0), Duracion_min: 10, 'Resultado_R$': 300,  Cantidad: 5 });
      trades.push({ Fecha: iso(y,m,dia,11,0), Duracion_min: 10, 'Resultado_R$': -100, Cantidad: 5 });
    } else if (tipo === 'vingador_esp') {
      // Solapado: por ENTRADA daría pico 0; por CIERRE estimado da pico 1300
      trades.push({ Fecha: iso(y,m,dia,10,0),  Duracion_min: 120, 'Resultado_R$': -1700, Cantidad: 5 });
      trades.push({ Fecha: iso(y,m,dia,10,30), Duracion_min: 5,   'Resultado_R$': 1300,  Cantidad: 5 });
    } else if (tipo === 'vingador') {
      trades.push({ Fecha: iso(y,m,dia,10,0), Duracion_min: 10, 'Resultado_R$': -150, Cantidad: 5 });
      trades.push({ Fecha: iso(y,m,dia,11,0), Duracion_min: 10, 'Resultado_R$': -250, Cantidad: 5 });
    } else if (tipo === 'apostador') {
      trades.push({ Fecha: iso(y,m,dia,10,0), Duracion_min: 10, 'Resultado_R$': 100, Cantidad: 15 });
      trades.push({ Fecha: iso(y,m,dia,11,0), Duracion_min: 10, 'Resultado_R$': 100, Cantidad: 15 });
    } else {
      trades.push({ Fecha: iso(y,m,dia,10,0), Duracion_min: 10, 'Resultado_R$': 50,  Cantidad: 5 });
      trades.push({ Fecha: iso(y,m,dia,11,0), Duracion_min: 10, 'Resultado_R$': -50, Cantidad: 5 });
    }
    count++;
    d.setDate(d.getDate() + 1);
  }
  return { registros, trades };
}

function gerarDatasetA() {
  const b = gerarDatasetB();
  const regs = b.registros.slice(0, 12);
  const fechas = new Set(regs.map(r => r.Fecha));
  return { registros: regs, trades: b.trades.filter(t => {
    const d = new Date(t.Fecha);
    return fechas.has(fkey(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }) };
}

function criarBackend(opts) {
  return {
    async fetch(url) {
      const params = Object.fromEntries(new URL(url).searchParams.entries());
      let out;
      if (params.action === 'diario_estado') {
        out = { ok: true, fecha: params.fecha,
                perfil: opts.perfil, acesso_analise: opts.acesso,
                registro: null };
      } else if (params.action === 'trades') {
        out = { ok: true, trades: opts.trades };
      } else if (params.action === 'diario_registros') {
        out = { ok: true, registros: opts.registros };
      } else out = { ok: false, error: 'Ação inválida.' };
      return { json: async () => out };
    }
  };
}

async function montarPagina(backend) {
  const statsJs = fs.readFileSync('/mnt/project/stats.js', 'utf8');
  const html = fs.readFileSync('/home/claude/diario/analise_performance.html', 'utf8')
    .replace('<script src="nav.js"></script>', '')
    .replace('<script src="stats.js"></script>', () => '<script>' + statsJs + '</scr' + 'ipt>');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://ecopatagonia.github.io/Trade-Analisis/analise_performance.html',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.APPSCRIPT_URL = 'https://script.test/exec';
      window.iniciarPagina = () => ({ token: 'tok-test', nome: 'MAURO', rol: 'admin' });
      window.fetch = (url) => backend.fetch(url);
      window.scrollTo = () => {};
    }
  });
  await new Promise(r => setTimeout(r, 60));
  return dom.window;
}

function texto(w, id) { return w.document.getElementById(id).textContent.trim(); }
function visivel(w, id) { return w.document.getElementById(id).style.display !== 'none'; }

const PERFIL = { Fraqueza_Principal: 'apostador', Fraqueza_Secundaria: 'nenhuma', Experiencia: '3_5', Capital_Faixa: '50k_100k', Meta_Mensal: 15000 };

(async function main() {

  console.log('\n== A. Gates de acceso ==');
  let w = await montarPagina(criarBackend({ perfil: null, acesso: 'Sim', trades: [], registros: [] }));
  check('sin perfil: contenido oculto (redirect al onboarding)', w.document.getElementById('conteudo').style.display === 'none');
  w = await montarPagina(criarBackend({ perfil: PERFIL, acesso: 'Não', trades: [], registros: [] }));
  check('sin Acesso_Analise: pantalla de acceso restringido', visivel(w, 'sem-acesso') && !visivel(w, 'analises'));

  console.log('\n== B. Dataset A: 12 días → tempranas abiertas, candados con progreso ==');
  const dsA = gerarDatasetA();
  w = await montarPagina(criarBackend({ perfil: PERFIL, acesso: 'Sim', trades: dsA.trades, registros: dsA.registros }));
  check('header: 12 dias com diário + CSV', texto(w, 'n-header') === '12 dias com diário + CSV', texto(w, 'n-header'));
  check('Quem tem operado visible', visivel(w, 'sec-quem'));
  check('Constância visible', visivel(w, 'sec-constancia'));
  check('candado custo con "12 de 30"', visivel(w, 'lock-custo') && texto(w, 'prog-custo-label') === '12 de 30 dias com diário + CSV');
  check('barra de progreso al 40%', w.document.getElementById('prog-custo').style.width === '40%');
  check('candado contraste "12 de 90 dias de diário"', visivel(w, 'lock-contraste') && texto(w, 'prog-contraste-label') === '12 de 90 dias de diário');
  check('secciones 30 ocultas', !visivel(w, 'sec-custo') && !visivel(w, 'sec-aderencia') && !visivel(w, 'sec-devolucao'));

  console.log('\n== C. Dataset B: 32 días → secciones 30 abiertas ==');
  const dsB = gerarDatasetB();
  w = await montarPagina(criarBackend({ perfil: PERFIL, acesso: 'Sim', trades: dsB.trades, registros: dsB.registros }));
  check('header: 32 dias', texto(w, 'n-header') === '32 dias com diário + CSV');

  // Quem tem operado
  const dist = texto(w, 'dist-arquetipos');
  check('distribución: estrategista 16× / vingador 8×', dist.indexOf('16×') !== -1 && dist.indexOf('8×') !== -1);
  const destaque = w.document.querySelector('#dist-arquetipos .dist-barra.destaque');
  check('destaque en la fraqueza observada (vingador, no estrategista)', destaque && destaque.closest('.dist-linha').textContent.indexOf('O Vingador') !== -1);
  check('nota: declarado Apostador vs observado Vingador + aviso 90 días',
    texto(w, 'nota-quem-texto').indexOf('O Apostador') !== -1 && texto(w, 'nota-quem-texto').indexOf('O Vingador') !== -1 && texto(w, 'nota-quem-texto').indexOf('90 dias') !== -1, texto(w, 'nota-quem-texto'));

  // Constância
  const constancia = texto(w, 'tabela-constancia');
  check('constância: valores únicos → "todos os dias"', constancia.indexOf('− R$ 4.000 · todos os dias') !== -1 && constancia.indexOf('10 · todos os dias') !== -1, constancia.slice(0, 120));
  check('satisfação: 16 · 8 · 8', constancia.indexOf('Satisfeito 16 · Neutro 8 · Insatisfeito 8') !== -1);

  // Custo por personagem
  check('sección custo abierta', visivel(w, 'sec-custo') && !visivel(w, 'lock-custo'));
  const custo = texto(w, 'tabela-custo');
  check('custo: vingador −400 primero (peor expectancy)', w.document.querySelector('#tabela-custo tr').textContent.indexOf('O Vingador') !== -1 && custo.indexOf('− R$ 400') !== -1, custo);
  check('custo: estrategista + R$ 200 · euforico R$ 0', custo.indexOf('+ R$ 200') !== -1 && custo.indexOf('R$ 0') !== -1);
  check('flag n baixo en grupos chicos (n=4)', custo.indexOf('(n baixo)') !== -1);

  // Aderência
  const ader = texto(w, 'tabela-aderencia');
  const filaPerda = w.document.querySelectorAll('#tabela-aderencia tr')[0].textContent;
  const filaContr = w.document.querySelectorAll('#tabela-aderencia tr')[1].textContent;
  check('aderência perda: 32 confirmadas / 0 contradições', filaPerda.replace(/\s/g, '') === 'Perdamáxima32000', filaPerda);
  check('aderência contratos: 28 confirmadas / 4 contradições', /contratos2840/.test(filaContr.replace(/\s/g, '')), filaContr);
  check('calibração 94%', texto(w, 'val-calibracao') === '94%');

  // Processo × Resultado
  check('quadrantes: SL 16 · SP 0 · IL 0 · IP 8', texto(w, 'q-sl') === '16' && texto(w, 'q-sp') === '0' && texto(w, 'q-il') === '0' && texto(w, 'q-ip') === '8');
  check('8 neutros fuera de los quadrantes', texto(w, 'nota-neutros').indexOf('8 dias') !== -1);

  // Devolução — la prueba del orden por cierre estimado
  check('giveback: mediana R$ 100 · máx R$ 1.700 (requiere orden por CIERRE)', texto(w, 'val-giveback') === 'mediana R$ 100 · máx. R$ 1.700', texto(w, 'val-giveback'));
  check('meta en mano: 2 dias · devolução R$ 3.400', texto(w, 'val-meta-maos') === '2 dias · devolução de R$ 3.400', texto(w, 'val-meta-maos'));
  const devol = texto(w, 'tabela-devolucao');
  check('tabla devolução por arquétipo: vingador mediana más alta primero', w.document.querySelector('#tabela-devolucao tr').textContent.indexOf('O Vingador') !== -1, devol);

  // Contraste sigue bloqueado
  check('contraste bloqueado con "32 de 90 dias de diário"', visivel(w, 'lock-contraste') && texto(w, 'prog-contraste-label') === '32 de 90 dias de diário');

  console.log('\n== D. curvaDia: orden por cierre estimado (verificación directa) ==');
  const dia = [
    { Fecha: iso(2026,5,5,10,0),  Duracion_min: 120, 'Resultado_R$': -1700, Cantidad: 5 },
    { Fecha: iso(2026,5,5,10,30), Duracion_min: 5,   'Resultado_R$': 1300,  Cantidad: 5 }
  ];
  const c = w.curvaDia(dia);
  check('pico 1300 (por entrada habría dado 0)', c.pico === 1300, c);
  check('resultado -400, giveback 1700, minAcum -400', c.resultado === -400 && c.giveback === 1700 && c.minAcum === -400, c);

  console.log(`\n===== RESULTADO: ${nOK} OK / ${nFail} FALLOS =====\n`);
  process.exit(nFail > 0 ? 1 : 0);
})();
