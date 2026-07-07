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

/**
 * ===== Funciones de segmentación (para Segmentação Temporal, Direção,
 * Volume & Contratos, Curva de Resultado) =====
 */

function horaDoTrade(t) {
  // Se calcula desde Fecha (datetime completo), NUNCA desde Hora_Entrada —
  // Google Sheets autoconvierte strings tipo "10:01:00" a su formato interno
  // de hora, corrompiendo el valor original al releerlo.
  return dataDoTrade(t).getHours();
}

function diaSemanaDoTrade(t) {
  return dataDoTrade(t).getDay(); // 0=domingo ... 6=sábado
}

function agruparEResumir(trades, keyFn) {
  const grupos = {};
  trades.forEach(t => {
    const chave = keyFn(t);
    if (chave === null || chave === undefined) return;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(t);
  });
  return Object.keys(grupos).map(chave => {
    return Object.assign({ chave }, calcularBasico(grupos[chave]));
  });
}

function calcularPorHora(trades) {
  return agruparEResumir(trades, horaDoTrade).sort((a, b) => a.chave - b.chave);
}

function calcularPorDiaSemana(trades) {
  // Só dias úteis (B3 não opera fins de semana) — sempre os 5, mesmo sem dados ainda
  const nomes = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' };
  const grupos = agruparEResumir(trades, diaSemanaDoTrade);
  return [1, 2, 3, 4, 5].map(dia => {
    const encontrado = grupos.find(g => Number(g.chave) === dia);
    return encontrado
      ? Object.assign({}, encontrado, { nome: nomes[dia] })
      : { chave: dia, nome: nomes[dia], n: 0 };
  });
}

function bucketDuracao(minutos) {
  if (minutos < 2) return '0-2min';
  if (minutos < 5) return '2-5min';
  if (minutos < 15) return '5-15min';
  if (minutos < 30) return '15-30min';
  if (minutos < 60) return '30-60min';
  if (minutos < 120) return '1-2h';
  return '>2h';
}

function calcularPorDuracao(trades) {
  const ordem = ['0-2min', '2-5min', '5-15min', '15-30min', '30-60min', '1-2h', '>2h'];
  const grupos = agruparEResumir(trades, t => bucketDuracao(Number(t.Duracion_min) || 0));
  return ordem.map(label => grupos.find(g => g.chave === label) || { chave: label, n: 0 });
}

function calcularPorDirecao(trades) {
  return agruparEResumir(trades, t => t.Direccion);
}

function calcularPorContrato(trades) {
  return agruparEResumir(trades, t => t.Contrato);
}

function bucketContratos(qtd) {
  if (qtd <= 5) return '1-5';
  if (qtd <= 15) return '6-15';
  if (qtd <= 40) return '16-40';
  return '41+';
}

function calcularPorFaixaContratos(trades) {
  const ordem = ['1-5', '6-15', '16-40', '41+'];
  const grupos = agruparEResumir(trades, t => bucketContratos(Number(t.Cantidad) || 0));
  return ordem.map(label => grupos.find(g => g.chave === label) || { chave: label, n: 0 });
}

function media(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcularMediaPorResultado(trades, campo) {
  const ganhadoras = trades.filter(t => (Number(t['Resultado_R$']) || 0) >= 0).map(t => Number(t[campo]) || 0);
  const perdedoras = trades.filter(t => (Number(t['Resultado_R$']) || 0) < 0).map(t => Number(t[campo]) || 0);
  return {
    ganhadoras: { media: media(ganhadoras), n: ganhadoras.length },
    perdedoras: { media: media(perdedoras), n: perdedoras.length }
  };
}

function calcularDrawdown(tradesOrdenados) {
  let equity = 0, peak = 0, maxDd = 0, maxDdData = null;
  const curva = [];
  tradesOrdenados.forEach(t => {
    equity += Number(t['Resultado_R$']) || 0;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) { maxDd = dd; maxDdData = dataDoTrade(t); }
    curva.push({ data: dataDoTrade(t), acumulado: equity });
  });
  return { maxDrawdown: maxDd, maxDrawdownData: maxDdData, peak, equityFinal: equity, curva };
}

function calcularRachaMaxima(tradesOrdenados) {
  let maxGanhos = 0, maxPerdas = 0, atualTipo = null, atualTamanho = 0;
  tradesOrdenados.forEach(t => {
    const tipo = (Number(t['Resultado_R$']) || 0) >= 0 ? 'ganho' : 'perda';
    if (tipo === atualTipo) atualTamanho++;
    else { atualTipo = tipo; atualTamanho = 1; }
    if (tipo === 'ganho') maxGanhos = Math.max(maxGanhos, atualTamanho);
    else maxPerdas = Math.max(maxPerdas, atualTamanho);
  });
  return { maxGanhos, maxPerdas };
}

function chaveDia(data) { return data.toISOString().slice(0, 10); }
function chaveSemana(data) {
  const d = new Date(data);
  const dia = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - dia);
  return chaveDia(d);
}
function chaveMes(data) { return data.toISOString().slice(0, 7); }

function melhorPiorPeriodo(trades, chaveFn) {
  const grupos = {};
  trades.forEach(t => {
    const chave = chaveFn(dataDoTrade(t));
    grupos[chave] = (grupos[chave] || 0) + (Number(t['Resultado_R$']) || 0);
  });
  const entradas = Object.entries(grupos);
  if (entradas.length === 0) return { melhor: null, pior: null };
  const melhor = entradas.reduce((a, b) => b[1] > a[1] ? b : a);
  const pior = entradas.reduce((a, b) => b[1] < a[1] ? b : a);
  return {
    melhor: { chave: melhor[0], valor: melhor[1] },
    pior: { chave: pior[0], valor: pior[1] }
  };
}

/**
 * ===== Funções para Curva de Resultado & Risco =====
 * (resumo por dia/semana/mês com pontos, média acumulada corrida,
 * rachas por operação e por dia, filtro por janela temporal)
 */

// Agrupa trades por dia (chaveFn = chaveDia/chaveSemana/chaveMes), somando
// Resultado_R$ E pontos ponderados por Cantidad de contratos — diferente de
// agruparEResumir/calcularBasico, que só trabalham com Resultado_R$.
// Resultado_Pts é o movimento por contrato (não ajustado por quantidade), então
// somar o valor cru de várias operações com quantidades bem diferentes (1 vs
// 40+ contratos) produz um total sem sentido, que pode inclusive ter sinal
// oposto ao de Resultado_R$. Ponderamos por Cantidad (o mesmo fator que gera
// Resultado_R$ = Pontos × Cantidad × 0,20) para que o sinal dos pontos
// agregados sempre bata com o sinal do resultado em R$.
function resumoPorPeriodo(tradesOrdenados, chaveFn) {
  const grupos = {};
  tradesOrdenados.forEach(t => {
    const chave = chaveFn(dataDoTrade(t));
    if (!grupos[chave]) grupos[chave] = { chave, resultado: 0, pontos: 0, operacoes: 0 };
    const cantidad = Number(t.Cantidad) || 0;
    grupos[chave].resultado += Number(t['Resultado_R$']) || 0;
    grupos[chave].pontos += (Number(t['Resultado_Pts']) || 0) * cantidad;
    grupos[chave].operacoes += 1;
  });
  return Object.values(grupos).sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
}

// Recebe a saída de resumoPorPeriodo e adiciona, a cada item, o resultado/pontos
// acumulados divididos pelo número de períodos decorridos até ali (média corrida).
function calcularMediaAcumulada(periodos) {
  let acR = 0, acP = 0;
  return periodos.map((p, i) => {
    acR += p.resultado;
    acP += p.pontos;
    return Object.assign({}, p, {
      mediaAcumuladaR: acR / (i + 1),
      mediaAcumuladaP: acP / (i + 1)
    });
  });
}

// Maior racha de OPERAÇÕES seguidas (ganho >= 0, perda < 0) — independente do
// dia em que ocorreram. Pontos são ponderados por Cantidad (mesmo motivo do
// resumoPorPeriodo acima) para que o sinal nunca contradiga o de Resultado_R$.
// Retorna tamanho (nº de operações), resultado (R$) e pontos totais da racha,
// além da média por operação dentro dela.
function calcularRachasOperacoes(tradesOrdenados) {
  let atualTipo = null, atualTamanho = 0, atualResultado = 0, atualPontos = 0;
  let melhorGanho = { tamanho: 0, resultado: 0, pontos: 0 };
  let melhorPerda = { tamanho: 0, resultado: 0, pontos: 0 };

  tradesOrdenados.forEach(t => {
    const res = Number(t['Resultado_R$']) || 0;
    const pts = (Number(t['Resultado_Pts']) || 0) * (Number(t.Cantidad) || 0);
    const tipo = res >= 0 ? 'ganho' : 'perda';
    if (tipo === atualTipo) {
      atualTamanho++; atualResultado += res; atualPontos += pts;
    } else {
      atualTipo = tipo; atualTamanho = 1; atualResultado = res; atualPontos = pts;
    }
    if (tipo === 'ganho' && atualTamanho > melhorGanho.tamanho) {
      melhorGanho = { tamanho: atualTamanho, resultado: atualResultado, pontos: atualPontos };
    }
    if (tipo === 'perda' && atualTamanho > melhorPerda.tamanho) {
      melhorPerda = { tamanho: atualTamanho, resultado: atualResultado, pontos: atualPontos };
    }
  });

  function comMedia(r) {
    return Object.assign({}, r, {
      mediaResultado: r.tamanho > 0 ? r.resultado / r.tamanho : 0,
      mediaPontos: r.tamanho > 0 ? r.pontos / r.tamanho : 0
    });
  }
  return { ganhos: comMedia(melhorGanho), perdas: comMedia(melhorPerda) };
}

// Maior racha de DIAS seguidos com resultado líquido positivo/negativo —
// o sinal é o do dia inteiro (soma de todas as operações daquele dia), então
// um dia com operações mistas conta pelo saldo final, não pela operação a
// operação. "Seguidos" = dias consecutivos NA BASE (pregões seguidos operados),
// não dias de calendário consecutivos — fins de semana não quebram a racha
// porque simplesmente não existem como pregão.
function calcularRachasDias(diasOrdenados) {
  let atualTipo = null, atualTamanho = 0, atualResultado = 0, atualPontos = 0;
  let melhorGanho = { dias: 0, resultado: 0, pontos: 0 };
  let melhorPerda = { dias: 0, resultado: 0, pontos: 0 };

  diasOrdenados.forEach(d => {
    const tipo = d.resultado >= 0 ? 'ganho' : 'perda';
    if (tipo === atualTipo) {
      atualTamanho++; atualResultado += d.resultado; atualPontos += d.pontos;
    } else {
      atualTipo = tipo; atualTamanho = 1; atualResultado = d.resultado; atualPontos = d.pontos;
    }
    if (tipo === 'ganho' && atualTamanho > melhorGanho.dias) {
      melhorGanho = { dias: atualTamanho, resultado: atualResultado, pontos: atualPontos };
    }
    if (tipo === 'perda' && atualTamanho > melhorPerda.dias) {
      melhorPerda = { dias: atualTamanho, resultado: atualResultado, pontos: atualPontos };
    }
  });

  function comMedia(r) {
    return Object.assign({}, r, {
      mediaResultado: r.dias > 0 ? r.resultado / r.dias : 0,
      mediaPontos: r.dias > 0 ? r.pontos / r.dias : 0
    });
  }
  return { ganhos: comMedia(melhorGanho), perdas: comMedia(melhorPerda) };
}

// Filtro por janela temporal para o seletor "Período" (Último dia, Semana, Mês,
// 7 dias, 30 dias, Ano, Personalizado). "Último dia" usa o último pregão
// presente na base (não o dia real de hoje) — se o trader ainda não carregou o
// CSV de hoje, a página não fica vazia. As demais janelas usam a data real
// atual. "personalizado" retorna os trades sem filtrar — a própria página
// aplica o intervalo De/Até escolhido pelo usuário.
function filtrarPorJanela(trades, janela, hoje) {
  if (trades.length === 0) return [];
  hoje = hoje || new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let desde = null;

  if (janela === 'ultimo_dia') {
    const ultimaData = trades.reduce((max, t) => {
      const d = dataDoTrade(t);
      return d > max ? d : max;
    }, dataDoTrade(trades[0]));
    const alvo = ultimaData.toDateString();
    return trades.filter(t => dataDoTrade(t).toDateString() === alvo);
  }

  switch (janela) {
    case 'semana':
      desde = new Date(inicioHoje);
      desde.setDate(inicioHoje.getDate() - (inicioHoje.getDay() === 0 ? 6 : inicioHoje.getDay() - 1));
      break;
    case 'mes':
      desde = new Date(inicioHoje.getFullYear(), inicioHoje.getMonth(), 1);
      break;
    case '7_dias':
      desde = new Date(inicioHoje); desde.setDate(inicioHoje.getDate() - 6);
      break;
    case '30_dias':
      desde = new Date(inicioHoje); desde.setDate(inicioHoje.getDate() - 29);
      break;
    case 'ano':
      desde = new Date(inicioHoje.getFullYear(), 0, 1);
      break;
    default:
      return trades;
  }
  return trades.filter(t => dataDoTrade(t) >= desde);
}
