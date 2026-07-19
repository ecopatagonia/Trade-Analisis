/**
 * test_frontend.js — Integración jsdom de diario_trade.html contra backend simulado.
 * El mock de fetch implementa el mismo contrato que los endpoints ya testeados de Code.gs.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let nOK = 0, nFail = 0;
function check(nome, cond, det) {
  if (cond) { nOK++; console.log('  ✓ ' + nome); }
  else { nFail++; console.log('  ✗ ' + nome + (det !== undefined ? ' — ' + JSON.stringify(det) : '')); }
}

// ---------- Backend simulado (mismo contrato que Code.gs, ya validado en simulacion.js) ----------
function criarBackend() {
  const db = { perfil: null, registros: {} }; // registros[fecha] = {...}
  return {
    db,
    async fetch(url, opts) {
      let params;
      if (opts && opts.body) params = Object.fromEntries(opts.body.entries());
      else params = Object.fromEntries(new URL(url).searchParams.entries());
      const action = params.action;
      let out;

      if (action === 'diario_estado') {
        const reg = db.registros[params.fecha] || null;
        out = { ok: true, fecha: params.fecha, perfil: db.perfil,
                registro: reg ? Object.assign({}, reg, { temPre: !!reg.Data_Pre, temPos: !!reg.Data_Pos }) : null };
      } else if (action === 'salvar_perfil') {
        const ARQ = ['estrategista','teimoso','vingador','apostador','medroso','euforico'];
        if (['menos_1','1_3','3_5','mais_5'].indexOf(params.experiencia) === -1) out = { ok:false, error:'Valor de experiência inválido.' };
        else if (['ate_10k','10k_50k','50k_100k','acima_100k'].indexOf(params.capital_faixa) === -1) out = { ok:false, error:'Faixa de capital inválida.' };
        else if (!(parseFloat(params.meta_mensal) > 0) || /[^0-9.]/.test(params.meta_mensal)) out = { ok:false, error:'Meta mensal deve ser um número maior que zero.' };
        else if (ARQ.indexOf(params.fraqueza_principal) === -1) out = { ok:false, error:'Fraqueza principal inválida.' };
        else if (params.fraqueza_secundaria !== 'nenhuma' && ARQ.indexOf(params.fraqueza_secundaria) === -1) out = { ok:false, error:'Fraqueza secundária inválida.' };
        else if (params.fraqueza_secundaria === params.fraqueza_principal) out = { ok:false, error:'A fraqueza secundária deve ser diferente da principal.' };
        else {
          const atualizado = !!db.perfil;
          db.perfil = { Experiencia: params.experiencia, Capital_Faixa: params.capital_faixa,
                        Meta_Mensal: parseFloat(params.meta_mensal), Fraqueza_Principal: params.fraqueza_principal,
                        Fraqueza_Secundaria: params.fraqueza_secundaria };
          out = { ok: true, atualizado };
        }
      } else if (action === 'salvar_diario') {
        const reg = db.registros[params.fecha] || {};
        let aviso = null;
        if (params.momento === 'pre') {
          if (!(parseFloat(params.perda_max) > 0) || /[^0-9.]/.test(params.perda_max)) return respostaJson({ ok:false, error:'Perda máxima deve ser um número maior que zero.' });
          Object.assign(reg, { Perda_Max: parseFloat(params.perda_max), Contratos_Max: parseInt(params.contratos_max,10),
                               Meta_Dia: parseFloat(params.meta_dia), Efeito_Ontem: params.efeito_ontem,
                               Ansiedade: parseInt(params.ansiedade,10), Obs_Pre: params.obs_pre || '', Data_Pre: new Date().toISOString() });
        } else {
          if (!reg.Data_Pre) aviso = 'Este dia não tem plano pré-mercado — as métricas de aderência não estarão disponíveis para este dia.';
          Object.assign(reg, { Arquetipo: params.arquetipo, Resp_PerdaMax: params.resp_perdamax,
                               Resp_Contratos: params.resp_contratos, Riscos_Desnec: params.riscos_desnec,
                               Satisfacao: params.satisfacao, Obs_Pos: params.obs_pos || '', Data_Pos: new Date().toISOString() });
        }
        db.registros[params.fecha] = reg;
        out = { ok: true, fecha: params.fecha };
        if (aviso) out.aviso = aviso;
      } else {
        out = { ok: false, error: 'Ação inválida.' };
      }
      return respostaJson(out);
    }
  };
  function respostaJson(obj) { return { json: async () => obj }; }
}

// ---------- Montar la página ----------
async function montarPagina(backend) {
  const html = fs.readFileSync('/home/claude/diario/diario_trade.html', 'utf8')
    .replace('<script src="nav.js"></script>', ''); // nav.js se mockea abajo
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://ecopatagonia.github.io/Trade-Analisis/diario_trade.html',
    beforeParse(window) {
      window.APPSCRIPT_URL = 'https://script.test/exec';
      window.iniciarPagina = () => ({ token: 'tok-test', nome: 'MAURO', rol: 'admin' });
      window.fetch = (url, opts) => backend.fetch(url, opts);
      window.scrollTo = () => {};
    }
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 30)); // esperar carregar()
  return w;
}

function estadoVisivel(w) {
  const el = w.document.querySelector('.estado.visivel');
  return el ? el.id.replace('estado-', '') : null;
}

function temMarcada(w, gridId, classe) {
  return w.document.querySelectorAll('#' + gridId + ' .' + classe).length;
}
function nomeMarcado(w, gridId, classe) {
  const el = w.document.querySelector('#' + gridId + ' .' + classe + ' .arq-nome');
  return el ? el.textContent : null;
}

(async function main() {

  console.log('\n== A. Onboarding: sin perfil ==');
  let be = criarBackend();
  let w = await montarPagina(be);
  check('sin perfil → pantalla de bienvenida', estadoVisivel(w) === 'boasvindas', estadoVisivel(w));
  check('nav del módulo oculta sin perfil', w.document.getElementById('nav-diario').style.display === 'none');

  w.mostrar('perfil1');
  w.document.getElementById('perfil-experiencia').value = '3_5';
  w.document.getElementById('perfil-capital').value = '50k_100k';
  w.document.getElementById('perfil-meta').value = '15.000,00'; // formato BR con millar
  w.finalizarPasso1();
  check('paso 1 valido → avanza al paso 2', estadoVisivel(w) === 'perfil2');

  check('botón Finalizar bloqueado sin fraqueza principal', w.document.getElementById('btn-salvar-perfil').disabled === true);
  w.clicarFraqueza('apostador');
  check('principal marcada → botón libera, pregunta cambia a la 2ª', w.document.getElementById('btn-salvar-perfil').disabled === false &&
        w.document.getElementById('fraq-pergunta').textContent.indexOf('segunda') !== -1);
  w.clicarFraqueza('apostador');
  check('clicar la principal de nuevo NO la duplica como secundaria', temMarcada(w, 'grid-fraquezas', 'marcado-secundaria') === 0);
  w.clicarFraqueza('vingador');
  check('secundaria marcada (O Vingador)', nomeMarcado(w, 'grid-fraquezas', 'marcado-secundaria') === 'O Vingador');
  await w.salvarPerfil(w.document.getElementById('btn-salvar-perfil'));
  await new Promise(r => setTimeout(r, 10));
  check('perfil guardado en backend con ids correctos', be.db.perfil && be.db.perfil.Fraqueza_Principal === 'apostador' && be.db.perfil.Fraqueza_Secundaria === 'vingador' && be.db.perfil.Meta_Mensal === 15000, be.db.perfil);
  check('tras guardar perfil → home con nav visible', estadoVisivel(w) === 'home' && w.document.getElementById('nav-diario').style.display === 'flex');
  check('home muestra variante pré pendiente', w.document.getElementById('home-cta-pre').style.display === 'block');

  console.log('\n== B. Pré-mercado ==');
  w.abrirPre();
  check('abre el pré con la fecha del día', estadoVisivel(w) === 'pre' && w.document.getElementById('data-pre').textContent.length > 5);
  w.document.getElementById('pre-perda').value = '4.000';
  w.document.getElementById('pre-contratos').value = '10';
  w.document.getElementById('pre-meta').value = '1500,50';
  await w.salvarPre(w.document.querySelector('#estado-pre .btn-salvar'));
  await new Promise(r => setTimeout(r, 10));
  const fechaHoje = w.fechaLocalISO();
  const reg = be.db.registros[fechaHoje];
  check('pré guardado: "4.000" normalizado a 4000 (no 4)', reg && reg.Perda_Max === 4000, reg && reg.Perda_Max);
  check('meta "1500,50" → 1500.5', reg && reg.Meta_Dia === 1500.5, reg && reg.Meta_Dia);
  check('defaults del mockup enviados (neutro, ansiedade 2)', reg && reg.Efeito_Ontem === 'neutro' && reg.Ansiedade === 2);
  check('tras guardar → home variante pós pendiente', estadoVisivel(w) === 'home' && w.document.getElementById('home-cta-pos').style.display === 'block');
  check('muestra "salvo às HH:MM"', /salvo às \d{2}:\d{2}/.test(w.document.getElementById('status-pre-salvo').textContent), w.document.getElementById('status-pre-salvo').textContent);

  console.log('\n== C. Pós-mercado ==');
  w.abrirPos();
  check('abre el pós SIN aviso (hay pré)', estadoVisivel(w) === 'pos' && w.document.getElementById('aviso-sem-pre').style.display === 'none');
  await w.salvarPos(w.document.querySelector('#estado-pos .btn-salvar'));
  check('rechaza guardar sin arquétipo elegido', !be.db.registros[fechaHoje].Arquetipo);
  w.escolherArqDia('estrategista');
  await w.salvarPos(w.document.querySelector('#estado-pos .btn-salvar'));
  check('rechaza guardar sin checklist completo', !be.db.registros[fechaHoje].Arquetipo);
  w.marcarRadio('ck1', 'Sim'); w.marcarRadio('ck2', 'Sim'); w.marcarRadio('ck3', 'Não');
  await w.salvarPos(w.document.querySelector('#estado-pos .btn-salvar'));
  check('rechaza guardar sin satisfação', !be.db.registros[fechaHoje].Arquetipo);
  w.marcarRadio('satis', 'satisfeito');
  w.document.getElementById('pos-obs').value = 'segui o plano';
  await w.salvarPos(w.document.querySelector('#estado-pos .btn-salvar'));
  await new Promise(r => setTimeout(r, 10));
  check('pós guardado completo en backend', be.db.registros[fechaHoje].Arquetipo === 'estrategista' && be.db.registros[fechaHoje].Riscos_Desnec === 'Não' && be.db.registros[fechaHoje].Satisfacao === 'satisfeito');
  check('→ pantalla "Fechamento salvo" sin aviso', estadoVisivel(w) === 'salvo' && w.document.getElementById('aviso-salvo-sem-pre').style.display === 'none');
  w.voltarHome();
  check('home variante completo con las dos horas', w.document.getElementById('home-cta-completo').style.display === 'block' &&
        /salvo às/.test(w.document.getElementById('status-pos-completo').textContent));

  console.log('\n== D. Edición (pré-preenchimento) ==');
  w.abrirPos();
  check('editar: pós pre-rellenado con lo guardado', nomeMarcado(w, 'grid-arquetipos-pos', 'selecionado') === 'O Estrategista' && w.radioMarcado('satis') === 'satisfeito' && w.document.getElementById('pos-obs').value === 'segui o plano');
  w.abrirPre();
  check('editar: pré pre-rellenado (4000, 10, 1500,5)', w.document.getElementById('pre-perda').value === '4000' && w.document.getElementById('pre-contratos').value === '10' && w.document.getElementById('pre-meta').value === '1500,5', [w.document.getElementById('pre-perda').value, w.document.getElementById('pre-meta').value]);

  console.log('\n== E. Pós sem pré (usuario nuevo con perfil, va directo al pós) ==');
  be = criarBackend();
  be.db.perfil = { Experiencia: '1_3', Capital_Faixa: 'ate_10k', Meta_Mensal: 5000, Fraqueza_Principal: 'medroso', Fraqueza_Secundaria: 'nenhuma' };
  w = await montarPagina(be);
  check('con perfil → home directo (sin bienvenida)', estadoVisivel(w) === 'home');
  check('home pré pendiente ofrece atajo "só o pós"', w.document.getElementById('home-cta-pre').querySelector('.btn-secundario') !== null);
  w.abrirPos();
  check('pós sin pré muestra el aviso de aderencia', w.document.getElementById('aviso-sem-pre').style.display === 'block');
  w.escolherArqDia('vingador');
  w.marcarRadio('ck1', 'Não'); w.marcarRadio('ck2', 'Sim'); w.marcarRadio('ck3', 'Sim');
  w.marcarRadio('satis', 'insatisfeito');
  await w.salvarPos(w.document.querySelector('#estado-pos .btn-salvar'));
  await new Promise(r => setTimeout(r, 10));
  check('guardado y pantalla salvo CON aviso del backend', estadoVisivel(w) === 'salvo' && w.document.getElementById('aviso-salvo-sem-pre').style.display === 'block' &&
        w.document.getElementById('aviso-salvo-texto').textContent.indexOf('aderência') !== -1);

  console.log('\n== F. Editar Perfil ==');
  w.abrirEditarPerfil();
  check('Editar Perfil abre paso 1 pre-rellenado', estadoVisivel(w) === 'perfil1' && w.document.getElementById('perfil-experiencia').value === '1_3' && w.document.getElementById('perfil-meta').value === '5000');
  w.mostrar('perfil2');
  check('fraquezas pre-cargadas (O Medroso principal, sin 2ª)', nomeMarcado(w, 'grid-fraquezas', 'marcado-principal') === 'O Medroso' && temMarcada(w, 'grid-fraquezas', 'marcado-secundaria') === 0 && w.document.getElementById('fraq-ajuda').textContent.indexOf('não declarada') !== -1);

  console.log('\n== G. Validaciones del paso 1 ==');
  w.mostrar('perfil1');
  w.document.getElementById('perfil-meta').value = '';
  w.finalizarPasso1();
  check('meta vacía bloquea el paso 1', estadoVisivel(w) === 'perfil1');

  console.log('\n== H. normalizarNumeroBr (casos borde) ==');
  const casos = [
    ['4.000', '4000'], ['4.000,00', '4000.00'], ['1500,50', '1500.50'],
    ['1500.5', '1500.5'], ['500', '500'], ['1.234.567,89', '1234567.89'],
    ['−4000', '4000'], ['', '']
  ];
  casos.forEach(([entrada, esperado]) => {
    const got = w.normalizarNumeroBr(entrada);
    check(`"${entrada}" → "${esperado}"`, got === esperado, got);
  });

  console.log(`\n===== RESULTADO: ${nOK} OK / ${nFail} FALLOS =====\n`);
  process.exit(nFail > 0 ? 1 : 0);
})();
