/**
 * simulacion.js — Ejecuta Code.gs en Node con mocks de Apps Script.
 * Regla del proyecto: no alcanza con leer el código, hay que ejecutarlo.
 */
const fs = require('fs');
const crypto = require('crypto');

// ===================== MOCKS DEL ENTORNO GAS =====================

function pad(n) { return String(n).padStart(2, '0'); }

class MockSheet {
  constructor(nome, rows) { this.nome = nome; this.rows = rows; } // rows[0] = headers
  getDataRange() { return { getValues: () => this.rows.map(r => r.slice()) }; }
  getLastRow() { return this.rows.length; }
  appendRow(valores) {
    const width = this.rows[0].length;
    const fila = valores.slice();
    while (fila.length < width) fila.push('');
    this.rows.push(fila);
  }
  getRange(row, col, numRows, numCols) {
    const sheet = this;
    return {
      setNumberFormat(fmt) { sheet._fmt = sheet._fmt || {}; sheet._fmt[`${row},${col}`] = fmt; return this; },
      setValue(v) {
        while (sheet.rows.length < row) sheet.rows.push(sheet.rows[0].map(() => ''));
        // Simula la autoconversión de Sheets: string "YYYY-MM-DD" sin formato "@" → Date
        sheet.rows[row - 1][col - 1] = sheet._simularAutoconversion(v, row, col);
        return this;
      },
      setValues(matriz) {
        for (let r = 0; r < (numRows || matriz.length); r++) {
          while (sheet.rows.length < row + r) sheet.rows.push(sheet.rows[0].map(() => ''));
          for (let c = 0; c < (numCols || matriz[r].length); c++) {
            sheet.rows[row + r - 1][col + c - 1] = sheet._simularAutoconversion(matriz[r][c], row + r, col + c);
          }
        }
        return this;
      },
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const fila = [];
          for (let c = 0; c < numCols; c++) fila.push((sheet.rows[row + r - 1] || [])[col + c - 1]);
          out.push(fila);
        }
        return out;
      }
    };
  }
  // Núcleo del test de autoconversión: si la celda NO tiene formato '@', un string
  // con pinta de fecha se convierte a Date (como hace Google Sheets de verdad).
  _simularAutoconversion(v, row, col) {
    const fmt = (this._fmt || {})[`${row},${col}`];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && fmt !== '@') {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(y, m - 1, d); // ¡corrupción simulada!
    }
    return v;
  }
}

const sheets = {};
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null }) };

global.Session = { getScriptTimeZone: () => 'America/Sao_Paulo' };

global.Utilities = {
  formatDate(date, tz, fmt) {
    // Suficiente para 'yyyy-MM-dd' en el entorno de test (fechas locales)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  },
  computeDigest(alg, str) { return Array.from(crypto.createHash(alg === 'MD5' ? 'md5' : 'sha256').update(str).digest()); },
  base64Encode(bytes) { return Buffer.from(bytes.map(b => b < 0 ? b + 256 : b)).toString('base64'); },
  getUuid() { return crypto.randomUUID(); },
  DigestAlgorithm: { MD5: 'MD5', SHA_256: 'sha256' }
};

global.ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput(txt) { return { _txt: txt, setMimeType() { return this; } }; }
};

// ===================== CARGAR Code.gs =====================
eval(fs.readFileSync('/home/claude/diario/Code.gs', 'utf8'));

// ===================== DATOS DE PRUEBA =====================

const HOY = fechaHojeISO();

sheets['Usuarios'] = new MockSheet('Usuarios', [
  ['DDI', 'Celular', 'Nome', 'Hash_Senha', 'Salt', 'Ativo', 'Rol', 'Data_Cadastro', 'Acesso_Analise'],
  ['55', '11999990001', 'MAURO BRUCOLI', 'x', 'y', 'Sim', 'admin', new Date(), 'Sim'],
  ['55', '11999990002', 'MATIAS GATTO LOPEZ', 'x', 'y', 'Sim', 'trader', new Date(), 'Não'],
  ['55', '11999990003', 'INATIVO', 'x', 'y', 'Não', 'trader', new Date(), 'Não']
]);

const expira = new Date(Date.now() + 6 * 3600 * 1000);
sheets['Sesiones'] = new MockSheet('Sesiones', [
  ['Token', 'DDI', 'Celular', 'Expira_En'],
  ['tok-mauro', '55', '11999990001', expira],
  ['tok-matias', '55', '11999990002', expira],
  ['tok-vencido', '55', '11999990001', new Date(Date.now() - 1000)]
]);

// Trades con fechas reales del CSV de Profit (12/01 y 15/01) + una del día de HOY
const [hy, hm, hd] = HOY.split('-').map(Number);
sheets['Trades'] = new MockSheet('Trades', [
  ['ID_Trade', 'DDI_Usuario', 'Celular_Usuario', 'Fecha', 'Hora_Entrada', 'Hora_Salida', 'Duracion_min', 'Activo', 'Contrato', 'Direccion', 'Cantidad', 'Resultado_R$', 'Resultado_Pct', 'Fecha_Carga'],
  ['t1', '55', '11999990001', new Date(2026, 0, 12, 16, 17, 2), '16:17:02', '17:23:03', 66, 'WIN', 'WING26', 'Long', 1, -20, -100, new Date()],
  ['t2', '55', '11999990001', new Date(2026, 0, 15, 13, 58, 37), '13:58:37', '14:27:24', 28.8, 'WIN', 'WING26', 'Short', 1, -29, -145, new Date()],
  ['t3', '55', '11999990001', new Date(2026, 0, 15, 14, 27, 39), '14:27:39', '14:58:54', 31.3, 'WIN', 'WING26', 'Short', 1, -13, -65, new Date()],
  ['t4', '55', '11999990001', new Date(hy, hm - 1, hd, 10, 0, 0), '10:00:00', '10:05:00', 5, 'WIN', 'WINQ26', 'Long', 2, 150, 50, new Date()],
  ['t5', '55', '11999990002', new Date(2026, 0, 15, 10, 0, 0), '10:00:00', '10:10:00', 10, 'WIN', 'WING26', 'Long', 1, 40, 20, new Date()]
]);

sheets['Perfil_Trader'] = new MockSheet('Perfil_Trader', [
  ['DDI_Usuario', 'Celular_Usuario', 'Experiencia', 'Capital_Faixa', 'Meta_Mensal', 'Fraqueza_Principal', 'Fraqueza_Secundaria', 'Data_Registro', 'Data_Atualizacao']
]);

sheets['Diario_Trade'] = new MockSheet('Diario_Trade', [
  ['DDI_Usuario', 'Celular_Usuario', 'Fecha', 'Perda_Max', 'Contratos_Max', 'Meta_Dia', 'Efeito_Ontem', 'Ansiedade', 'Obs_Pre', 'Arquetipo', 'Resp_PerdaMax', 'Resp_Contratos', 'Riscos_Desnec', 'Satisfacao', 'Obs_Pos', 'Data_Pre', 'Data_Pos']
]);

// ===================== RUNNER =====================

let nOK = 0, nFail = 0;
function check(nombre, cond, detalle) {
  if (cond) { nOK++; console.log(`  ✓ ${nombre}`); }
  else { nFail++; console.log(`  ✗ ${nombre}${detalle ? ' — ' + JSON.stringify(detalle) : ''}`); }
}
function post(params) { return JSON.parse(doPost({ parameter: params })._txt); }
function get(params) { return JSON.parse(doGet({ parameter: params })._txt); }

// ===================== TESTS =====================

console.log('\n== 1. salvar_perfil ==');
let r = post({ action: 'salvar_perfil', token: 'tok-mauro', experiencia: '3_5', capital_faixa: '50k_100k', meta_mensal: '15000', fraqueza_principal: 'apostador', fraqueza_secundaria: 'vingador' });
check('crea perfil nuevo', r.ok && r.atualizado === false, r);
r = post({ action: 'salvar_perfil', token: 'tok-mauro', experiencia: 'mais_5', capital_faixa: 'acima_100k', meta_mensal: '20000', fraqueza_principal: 'apostador', fraqueza_secundaria: 'nenhuma' });
check('upsert: actualiza sin duplicar fila', r.ok && r.atualizado === true && sheets['Perfil_Trader'].rows.length === 2, { filas: sheets['Perfil_Trader'].rows.length });
check('Data_Registro preservada, Data_Atualizacao nueva', sheets['Perfil_Trader'].rows[1][7] instanceof Date && sheets['Perfil_Trader'].rows[1][8] instanceof Date);
r = post({ action: 'salvar_perfil', token: 'tok-mauro', experiencia: 'mais_5', capital_faixa: 'acima_100k', meta_mensal: '20000', fraqueza_principal: 'apostador', fraqueza_secundaria: 'apostador' });
check('rechaza secundaria == principal', !r.ok, r);
r = post({ action: 'salvar_perfil', token: 'tok-mauro', experiencia: 'x', capital_faixa: 'acima_100k', meta_mensal: '20000', fraqueza_principal: 'apostador' });
check('rechaza experiencia inválida', !r.ok);
r = post({ action: 'salvar_perfil', token: 'tok-mauro', experiencia: 'mais_5', capital_faixa: 'acima_100k', meta_mensal: '-5', fraqueza_principal: 'apostador' });
check('rechaza meta_mensal <= 0', !r.ok);
r = post({ action: 'salvar_perfil', token: 'tok-vencido', experiencia: 'mais_5', capital_faixa: 'acima_100k', meta_mensal: '100', fraqueza_principal: 'apostador' });
check('rechaza token vencido', !r.ok);

console.log('\n== 2. salvar_diario (pré) ==');
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pre', fecha: HOY, perda_max: '4000', contratos_max: '10', meta_dia: '1500', efeito_ontem: 'neutro', ansiedade: '2', obs_pre: 'dormi bem' });
check('pré crea la fila', r.ok && sheets['Diario_Trade'].rows.length === 2, r);
check('Fecha guardada como TEXTO (formato @ aplicado antes de escribir)', typeof sheets['Diario_Trade'].rows[1][2] === 'string' && sheets['Diario_Trade'].rows[1][2] === HOY, { celda: sheets['Diario_Trade'].rows[1][2] });
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pre', fecha: HOY, perda_max: '3000', contratos_max: '8', meta_dia: '1200', efeito_ontem: 'cauteloso', ansiedade: '3' });
check('re-guardar pré sobrescribe (no duplica)', r.ok && sheets['Diario_Trade'].rows.length === 2 && sheets['Diario_Trade'].rows[1][3] === 3000, { perda: sheets['Diario_Trade'].rows[1][3] });
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pre', fecha: '2026-06-15', perda_max: '4000', contratos_max: '10', meta_dia: '1500', efeito_ontem: 'neutro', ansiedade: '2' });
check('rechaza pré retroactivo (plan post-resultado = dato contaminado)', !r.ok, r);
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pre', fecha: '2026-02-30', perda_max: '4000', contratos_max: '10', meta_dia: '1500', efeito_ontem: 'neutro', ansiedade: '2' });
check('rechaza fecha inexistente (2026-02-30)', !r.ok);
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pre', fecha: HOY, perda_max: '4000', contratos_max: '10', meta_dia: '1500', efeito_ontem: 'neutro', ansiedade: '7' });
check('rechaza ansiedade fuera de 1-5', !r.ok);
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pre', fecha: HOY, perda_max: '0', contratos_max: '10', meta_dia: '1500', efeito_ontem: 'neutro', ansiedade: '2' });
check('rechaza perda_max = 0', !r.ok);

console.log('\n== 3. salvar_diario (pós) ==');
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pos', fecha: HOY, arquetipo: 'estrategista', resp_perdamax: 'Sim', resp_contratos: 'Sim', riscos_desnec: 'Não', satisfacao: 'satisfeito', obs_pos: 'segui o plano' });
check('pós completa la fila del pré (sin aviso)', r.ok && !r.aviso && sheets['Diario_Trade'].rows.length === 2, r);
check('fila tiene pré Y pós', !!sheets['Diario_Trade'].rows[1][15] && !!sheets['Diario_Trade'].rows[1][16]);
check('Fecha sigue siendo texto tras el update', typeof sheets['Diario_Trade'].rows[1][2] === 'string');
// Pós sin pré: Matias guarda directo el pós
r = post({ action: 'salvar_diario', token: 'tok-matias', momento: 'pos', fecha: HOY, arquetipo: 'vingador', resp_perdamax: 'Não', resp_contratos: 'Sim', riscos_desnec: 'Sim', satisfacao: 'insatisfeito' });
check('pós sin pré: permitido CON aviso de aderencia', r.ok && !!r.aviso, r);
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pos', fecha: HOY, arquetipo: 'ausente', resp_perdamax: 'Sim', resp_contratos: 'Sim', riscos_desnec: 'Não', satisfacao: 'neutro' });
check('rechaza arquétipo eliminado ("ausente")', !r.ok);
r = post({ action: 'salvar_diario', token: 'tok-mauro', momento: 'pos', fecha: HOY, arquetipo: 'teimoso', resp_perdamax: 'sim', resp_contratos: 'Sim', riscos_desnec: 'Não', satisfacao: 'neutro' });
check('rechaza Sim/Não con casing incorrecto ("sim")', !r.ok);

console.log('\n== 4. diario_estado ==');
r = get({ action: 'diario_estado', token: 'tok-mauro', fecha: HOY });
check('devuelve perfil + registro de hoy', r.ok && r.perfil && r.registro, { perfil: !!r.perfil, registro: !!r.registro });
check('flags temPre/temPos correctos', r.registro.temPre === true && r.registro.temPos === true);
check('registro.Fecha normalizada como texto', r.registro.Fecha === HOY);
check('perfil refleja el último upsert', r.perfil.Fraqueza_Principal === 'apostador' && r.perfil.Fraqueza_Secundaria === 'nenhuma');
// Usuario sin perfil ni registro previo (matias tiene registro pós pero no perfil)
r = get({ action: 'diario_estado', token: 'tok-matias', fecha: HOY });
check('sin perfil → perfil:null (pantalla de bienvenida)', r.ok && r.perfil === null && r.registro && r.registro.temPre === false && r.registro.temPos === true, { perfil: r.perfil, temPre: r.registro && r.registro.temPre });

console.log('\n== 5. diario_dias (calendario + join contra Trades) ==');
// Sembrar un registro completo de Mauro en enero CON Fecha corrupta como Date
// (simula fila legada autoconvertida por Sheets) para probar la normalización de lectura
sheets['Diario_Trade'].rows.push(['55', '11999990001', new Date(2026, 0, 15), 4000, 10, 1500, 'neutro', 2, '', 'estrategista', 'Sim', 'Sim', 'Não', 'satisfeito', '', new Date(2026, 0, 15, 9, 0), new Date(2026, 0, 15, 18, 0)]);
// Y un registro solo-pré el 12/01 (incompleto)
sheets['Diario_Trade'].rows.push(['55', '11999990001', '2026-01-12', 4000, 10, 1500, 'neutro', 2, '', '', '', '', '', '', '', new Date(2026, 0, 12, 9, 0), '']);
// Y un registro completo el 20/01 SIN trades ese día
sheets['Diario_Trade'].rows.push(['55', '11999990001', '2026-01-20', 4000, 10, 1500, 'neutro', 2, '', 'medroso', 'Sim', 'Sim', 'Não', 'neutro', '', new Date(2026, 0, 20, 9, 0), new Date(2026, 0, 20, 18, 0)]);

r = get({ action: 'diario_dias', token: 'tok-mauro', mes: '2026-01' });
check('devuelve solo días del mes pedido', r.ok && r.dias.length === 3, r.dias);
const d12 = r.dias.find(d => d.fecha === '2026-01-12');
const d15 = r.dias.find(d => d.fecha === '2026-01-15');
const d20 = r.dias.find(d => d.fecha === '2026-01-20');
check('12/01: pré solo → completo=false, tem_trades=true', d12 && d12.pre && !d12.pos && !d12.completo && d12.tem_trades, d12);
check('15/01 (Fecha corrupta como Date): normalizada y matchea → completo=true, tem_trades=true', d15 && d15.completo && d15.tem_trades, d15);
check('20/01: completo pero SIN trades → tem_trades=false (no clickeable)', d20 && d20.completo && !d20.tem_trades, d20);
r = get({ action: 'diario_dias', token: 'tok-matias', mes: '2026-01' });
check('aislamiento: Matias no ve los días de Mauro', r.ok && r.dias.length === 0, r.dias);
r = get({ action: 'diario_dias', token: 'tok-mauro', mes: '2026/01' });
check('rechaza formato de mes inválido', !r.ok);

console.log('\n== 6. Regresión: endpoints existentes intactos ==');
r = get({ action: 'trades', token: 'tok-mauro' });
check('action=trades sigue funcionando y filtra por usuario', r.ok && r.trades.length === 4, { n: r.trades && r.trades.length });
r = get({ action: 'usuarios', token: 'tok-mauro' });
check('action=usuarios sigue funcionando (admin)', r.ok && r.usuarios.length === 3 && !('Hash_Senha' in r.usuarios[0]));
r = post({ action: 'inexistente', token: 'tok-mauro' });
check('acción inválida sigue devolviendo error controlado', !r.ok);

console.log(`\n===== RESULTADO: ${nOK} OK / ${nFail} FALLOS =====\n`);
process.exit(nFail > 0 ? 1 : 0);
