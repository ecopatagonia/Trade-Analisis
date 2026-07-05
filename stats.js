/**
 * stats.js — Cálculos estadísticos puros sobre el array de trades.
 * Reciben trades (array de objetos tal como los devuelve doGet?action=trades)
 * y devuelven números. No tocan el DOM — cada página decide cómo pintarlos.
 *
 * Convención: un trade "gana" si Resultado_R$ >= 0 (breakeven cuenta como ganho).
 */

function dataDoTrade(t) {
  return new Date(t.Fecha);
}

function filtrarPorDia(trades, dataRef) {
  const alvo = new Date(dataRef).toDateString();
  return trades.filter(t => dataDoTrade(t).toDateString() === alvo);
}

function filtrarPorSemana(trades, dataRef) {
  const ref = new Date(dataRef);
  const diaSemana = ref.getDay() === 0 ? 6 : ref.getDay() - 1; // segunda=0
  const segunda = new Date(ref);
  segunda.setDate(ref.getDate() - diaSemana);
  segunda.setHours(0, 0, 0, 0);
  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);
  return trades.filter(t => {
    const d = dataDoTrade(t);
    return d >= segunda && d <= domingo;
  });
}

function calcularBasico(trades) {
  const n = trades.length;
  if (n === 0) {
    return { n: 0, resultado: 0, winRate: null, expectancy: null, melhor: null, pior: null };
  }
  const resultados = trades.map(t => Number(t['Resultado_R$']) || 0);
  const resultado = resultados.reduce((a, b) => a + b, 0);
  const ganhos = resultados.filter(r => r >= 0);
  const winRate = (ganhos.length / n) * 100;
  const expectancy = resultado / n;
  const melhor = Math.max(...resultados);
  const pior = Math.min(...resultados);
  return { n, resultado, winRate, expectancy, melhor, pior };
}

function calcularSequenciaAtiva(tradesOrdenados) {
  if (tradesOrdenados.length === 0) return { tipo: null, tamanho: 0 };
  let tipo = null, tamanho = 0;
  for (let i = tradesOrdenados.length - 1; i >= 0; i--) {
    const res = Number(tradesOrdenados[i]['Resultado_R$']) || 0;
    const tipoAtual = res >= 0 ? 'ganho' : 'perda';
    if (tipo === null) { tipo = tipoAtual; tamanho = 1; }
    else if (tipoAtual === tipo) { tamanho++; }
    else { break; }
  }
  return { tipo, tamanho };
}

function calcularAcumuladoTotal(trades) {
  return trades.reduce((acc, t) => acc + (Number(t['Resultado_R$']) || 0), 0);
}

function ordenarPorFecha(trades) {
  return [...trades].sort((a, b) => dataDoTrade(a) - dataDoTrade(b));
}

function formatarReais(valor) {
  const sinal = valor < 0 ? '-' : '';
  const abs = Math.abs(valor).toFixed(2).replace('.', ',');
  const partes = abs.split(',');
  partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sinal + 'R$ ' + partes.join(',');
}
