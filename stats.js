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
 * ===== Funciones POR DIA (para Controle de Risco) =====
 * Agrupan os trades por dia ANTES de calcular, em vez de tratar cada operação
 * como unidade. Dia é a unidade correta para cálculos de capital/risco —
 * o capital se expõe e se repõe por dia, não por operação isolada. As funções
 * por operação acima continuam existindo sem alteração, para o contexto
 * comportamental (ver CONTEXTO_TECNICO_PROYECTO.md).
 *
 * Todas recebem o array de trades tal como vem de doGet?action=trades — o
 * agrupamento por dia é feito internamente, a página não precisa fazer nada
 * antes de chamar.
 */

function agruparPorDia(trades) {
  const grupos = {};
  trades.forEach(t => {
    const chave = chaveDia(dataDoTrade(t));
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(t);
  });
  return Object.keys(grupos).sort().map(chave => {
    const tradesDoDia = grupos[chave];
    const resultado = tradesDoDia.reduce((acc, t) => acc + (Number(t['Resultado_R$']) || 0), 0);
    return { dia: chave, data: new Date(chave + 'T12:00:00'), resultado, n: tradesDoDia.length, trades: tradesDoDia };
  });
}

function filtrarPorRangoFechas(trades, dataInicio, dataFim) {
  return trades.filter(t => {
    const d = dataDoTrade(t);
    if (dataInicio && d < dataInicio) return false;
    if (dataFim && d > dataFim) return false;
    return true;
  });
}

function calcularBasicoPorDia(trades) {
  const dias = agruparPorDia(trades);
  const n = dias.length;
  if (n === 0) {
    return { n: 0, resultado: 0, winRate: null, expectancy: null, melhorDia: null, piorDia: null, dias: [] };
  }
  const resultados = dias.map(d => d.resultado);
  const resultado = resultados.reduce((a, b) => a + b, 0);
  const ganhos = resultados.filter(r => r >= 0);
  const winRate = (ganhos.length / n) * 100;
  const expectancy = resultado / n;
  const melhorDia = Math.max(...resultados);
  const piorDia = Math.min(...resultados);
  return { n, resultado, winRate, expectancy, melhorDia, piorDia, dias };
}

// Percentil linear (método comum, mesmo usado por numpy.percentile por padrão).
// valores: array de números (não precisa vir ordenado, a função ordena por conta própria).
function calcularPercentil(valores, p) {
  if (!valores || valores.length === 0) return null;
  const arr = [...valores].sort((a, b) => a - b);
  if (arr.length === 1) return arr[0];
  const idx = (p / 100) * (arr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const frac = idx - lo;
  return arr[lo] + (arr[hi] - arr[lo]) * frac;
}

function calcularPercentisDiarios(trades) {
  const dias = agruparPorDia(trades);
  const resultados = dias.map(d => d.resultado);
  if (resultados.length === 0) {
    return { n: 0, p5: null, p25: null, mediana: null, p75: null, p95: null, piorDia: null, melhorDia: null, media: null };
  }
  return {
    n: resultados.length,
    p5: calcularPercentil(resultados, 5),
    p25: calcularPercentil(resultados, 25),
    mediana: calcularPercentil(resultados, 50),
    p75: calcularPercentil(resultados, 75),
    p95: calcularPercentil(resultados, 95),
    piorDia: Math.min(...resultados),
    melhorDia: Math.max(...resultados),
    media: resultados.reduce((a, b) => a + b, 0) / resultados.length
  };
}

// Distribuição completa de rachas por dia (não só o máximo) — necessária para
// comparar observado vs. esperado teórico, como nas páginas de Controle de Risco.
function calcularRachasDias(trades) {
  const dias = agruparPorDia(trades);
  if (dias.length === 0) {
    return { maxGanhos: 0, maxPerdas: 0, distribuicaoPerdas: {}, distribuicaoGanhos: {}, nEventosPerdas: 0, nEventosGanhos: 0 };
  }
  let maxGanhos = 0, maxPerdas = 0, atualTipo = null, atualTamanho = 0;
  const distribuicaoPerdas = {};
  const distribuicaoGanhos = {};

  function fecharRachaAtual() {
    if (atualTipo === 'perda' && atualTamanho > 0) {
      distribuicaoPerdas[atualTamanho] = (distribuicaoPerdas[atualTamanho] || 0) + 1;
    }
    if (atualTipo === 'ganho' && atualTamanho > 0) {
      distribuicaoGanhos[atualTamanho] = (distribuicaoGanhos[atualTamanho] || 0) + 1;
    }
  }

  dias.forEach(d => {
    const tipo = d.resultado >= 0 ? 'ganho' : 'perda';
    if (tipo === atualTipo) {
      atualTamanho++;
    } else {
      fecharRachaAtual();
      atualTipo = tipo;
      atualTamanho = 1;
    }
    if (tipo === 'ganho') maxGanhos = Math.max(maxGanhos, atualTamanho);
    else maxPerdas = Math.max(maxPerdas, atualTamanho);
  });
  fecharRachaAtual(); // fecha a última racha, que não é fechada dentro do forEach

  const nEventosPerdas = Object.values(distribuicaoPerdas).reduce((a, b) => a + b, 0);
  const nEventosGanhos = Object.values(distribuicaoGanhos).reduce((a, b) => a + b, 0);

  return { maxGanhos, maxPerdas, distribuicaoPerdas, distribuicaoGanhos, nEventosPerdas, nEventosGanhos };
}

// Probabilidade teórica de uma racha (de perda ou ganho) ter exatamente N dias/operações
// seguidos, assumindo independência estatística total. Fórmula geométrica: q^(N-1) * (1-q),
// onde q é a probabilidade do evento que forma a racha (ex.: q = taxa de dias perdedores
// para uma racha de perdas). Serve para comparar observado vs. esperado.
function probabilidadeTeoricaRacha(q, n) {
  return Math.pow(q, n - 1) * (1 - q);
}

function calcularDrawdownDiario(trades) {
  const dias = agruparPorDia(trades);
  let equity = 0, peak = 0, maxDd = 0, diaMaxDd = null, peakNoMomentoMaxDd = 0;
  const curva = [];

  dias.forEach(d => {
    equity += d.resultado;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) {
      maxDd = dd;
      diaMaxDd = d.dia;
      peakNoMomentoMaxDd = peak;
    }
    curva.push({ dia: d.dia, acumulado: equity });
  });

  // Tempo de recuperação: primeiro dia, após o pior ponto, em que o acumulado
  // volta a alcançar o pico que havia antes daquele drawdown.
  let diaRecuperacao = null;
  let diasParaRecuperar = null;
  if (diaMaxDd) {
    const idxMaxDd = curva.findIndex(c => c.dia === diaMaxDd);
    for (let i = idxMaxDd + 1; i < curva.length; i++) {
      if (curva[i].acumulado >= peakNoMomentoMaxDd) {
        diaRecuperacao = curva[i].dia;
        diasParaRecuperar = i - idxMaxDd;
        break;
      }
    }
  }

  return {
    maxDrawdown: maxDd,
    diaMaxDrawdown: diaMaxDd,
    peakNoMomentoMaxDd,
    equityFinal: equity,
    diaRecuperacao,       // null enquanto não recuperou
    diasParaRecuperar,    // null enquanto não recuperou
    curva
  };
}

// Simulação retroativa de um circuit breaker diário: aplica um teto de perda
// por dia (limiteNegativo, ex.: -4000) sobre o resultado real de cada dia —
// dias que já foram positivos ficam intocados. Usado para mostrar o efeito
// histórico de um limite antes de ativá-lo de verdade.
function simularCircuitBreakerDiario(trades, limiteNegativo) {
  const dias = agruparPorDia(trades);
  const diasComFreio = dias.map(d => ({
    dia: d.dia,
    resultadoOriginal: d.resultado,
    resultadoComFreio: Math.max(d.resultado, limiteNegativo)
  }));

  const resultadoTotalOriginal = diasComFreio.reduce((a, d) => a + d.resultadoOriginal, 0);
  const resultadoTotalComFreio = diasComFreio.reduce((a, d) => a + d.resultadoComFreio, 0);

  let equity = 0, peak = 0, maxDd = 0;
  diasComFreio.forEach(d => {
    equity += d.resultadoComFreio;
    if (equity > peak) peak = equity;
    maxDd = Math.max(maxDd, peak - equity);
  });

  return {
    n: dias.length,
    resultadoTotalOriginal,
    resultadoTotalComFreio,
    maxDrawdownComFreio: maxDd,
    diasAfetados: diasComFreio.filter(d => d.resultadoOriginal < limiteNegativo).length
  };
}

// Classificação de confiabilidade da amostra, calibrada a DIAS (diferente do
// n<30 usado nas páginas por operação). Ver discussão no chat: percentis de
// cauda (P5/P95) e bootstrap por blocos precisam de mais dias que uma mediana simples.
function avaliarConfiabilidadeAmostraDias(n) {
  if (n < 20) {
    return { nivel: 'insuficiente', mensagem: 'Amostra insuficiente até para estatística básica (mediana). Use qualquer número aqui com muita cautela.' };
  }
  if (n < 60) {
    return { nivel: 'basico', mensagem: 'Suficiente para mediana e expectancy. Percentis de cauda (P5/P95) ainda pouco confiáveis — poucos dias na cauda.' };
  }
  if (n < 120) {
    return { nivel: 'moderado', mensagem: 'Confiável para mediana e P25/P75. P5/P95 aceitável, mas com cautela.' };
  }
  return { nivel: 'bom', mensagem: 'Amostra robusta para percentis, incluindo cauda (P5/P95).' };
}
