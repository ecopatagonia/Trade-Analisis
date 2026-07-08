/**
 * glossario.js — Diccionario de términos + ícone de ajuda inline (ⓘ).
 *
 * Uso em qualquer página:
 *   <script src="glossario.js"></script>
 *   ...em qualquer texto/label...
 *   <span data-termo="drawdown">Drawdown</span>
 *
 * O script escaneia a página sozinho (no load e via MutationObserver, para
 * conteúdo que chega depois via fetch) e adiciona um ⓘ clicável ao lado de
 * cada elemento com [data-termo]. Não precisa chamar nenhuma função manualmente.
 *
 * Para adicionar um termo novo: uma linha em GLOSSARIO_TERMOS. Nada mais.
 */

const GLOSSARIO_TERMOS = {
  drawdown: {
    titulo: 'Drawdown',
    texto: 'Queda desde o pico mais alto que sua curva de capital já alcançou até o ponto mais baixo depois dele. Não é "quanto perdi no total" — é "quanto cheguei a cair desde meu melhor momento". É a métrica mais direta de quanto capital você precisa para aguentar uma fase ruim sem quebrar.'
  },
  drawdown_maximo: {
    titulo: 'Drawdown Máximo',
    texto: 'O maior drawdown já registrado no seu histórico. Serve de base para calcular capital mínimo — mas é um piso, não um teto: um drawdown futuro pior que o histórico é sempre possível.'
  },
  racha: {
    titulo: 'Racha (sequência)',
    texto: 'Quantidade de operações ou dias seguidos com o mesmo resultado (só ganhos ou só perdas). Uma racha de perda de 5 significa 5 operações (ou dias) perdedores em fila, sem nenhum ganho no meio.'
  },
  racha_teorica: {
    titulo: 'Racha teórica (esperada)',
    texto: 'Quantas vezes uma racha de determinado tamanho deveria acontecer, se cada operação fosse totalmente independente da anterior (pura estatística, sem nenhum padrão de comportamento). Comparar isso com o que aconteceu de verdade mostra se suas perdas se agrupam mais do que o acaso explicaria — sinal de padrão comportamental, não só de azar.'
  },
  expectancy: {
    titulo: 'Expectancy (expectativa matemática)',
    texto: 'Quanto você ganha ou perde, em média, por operação (ou por dia). É o resultado total dividido pela quantidade de operações/dias. Diferente de win rate: você pode ganhar 70% das vezes e ainda ter expectancy negativa, se as perdas forem maiores que os ganhos.'
  },
  win_rate: {
    titulo: 'Win Rate (taxa de acerto)',
    texto: 'Porcentagem de operações (ou dias) com resultado positivo. Sozinho, não diz se o sistema é lucrativo — precisa ser lido junto com o tamanho médio dos ganhos e das perdas.'
  },
  profit_factor: {
    titulo: 'Profit Factor',
    texto: 'Soma de tudo que você ganhou dividida pela soma de tudo que perdeu. Acima de 1 = lucrativo no período. Um profit factor de 0,99, por exemplo, significa que para cada R$100 perdidos você ganhou R$99 — praticamente empatado, apesar de poder ter win rate alto.'
  },
  percentil: {
    titulo: 'Percentil',
    texto: 'O valor abaixo do qual cai uma certa porcentagem dos seus dados. O percentil 5 (P5) do resultado diário é o valor que só é superado (para pior) por 5% dos seus dias — ou seja, 95% dos seus dias foram melhores que isso. Serve para definir limites realistas sem se guiar pelo pior dia isolado (que pode ser um evento único, não o padrão normal).'
  },
  desvio_padrao: {
    titulo: 'Desvio Padrão',
    texto: 'Mede o quanto seus resultados variam em torno da média. Quanto maior, mais imprevisível é o dia a dia — mesmo com a mesma expectancy. Tem uma limitação: assume que os dados são simétricos, o que raramente é verdade em resultados de trade (por isso preferimos percentis para limites de risco).'
  },
  bootstrap: {
    titulo: 'Bootstrap (reamostragem)',
    texto: 'Técnica estatística que gera milhares de cenários alternativos reembaralhando seus próprios dados reais, para estimar o que poderia acontecer além do que já foi observado. Útil quando a amostra histórica é pequena demais para confiar no pior caso já visto como sendo o pior caso possível.'
  },
  bootstrap_blocos: {
    titulo: 'Bootstrap por Blocos',
    texto: 'Uma versão do bootstrap que reembaralha pedaços contínuos de dias (não dias soltos), para preservar rachas e agrupamentos que existem nos dados reais. Necessário quando as perdas se agrupam mais do que o acaso explicaria — o que é o seu caso.'
  },
  amostra_insuficiente: {
    titulo: 'Amostra Insuficiente',
    texto: 'Aviso que aparece quando há poucos dados (operações ou dias) para uma conclusão estatística confiável. Um percentil ou uma racha calculados sobre poucos pontos podem parecer precisos mas na prática são só ruído — o número muda muito se um único dado novo entrar na conta.'
  },
  circuit_breaker: {
    titulo: 'Circuit Breaker (freno de mão)',
    texto: 'Um limite de perda diária definido antes de operar, para parar de operar no dia assim que for atingido — independente de quantas operações já foram feitas. A ideia é cortar o dia ruim antes que ele vire um dia catastrófico.'
  },
  capital_minimo: {
    titulo: 'Capital Mínimo',
    texto: 'Capital sugerido para operar sem alto risco de quebrar a conta, calculado como margem necessária + uma folga de segurança sobre o pior drawdown já visto (normalmente 1,5x a 3x, dependendo de quão conservador você quer ser).'
  },
  fator_seguranca: {
    titulo: 'Fator de Segurança',
    texto: 'Multiplicador aplicado sobre o pior drawdown histórico para definir o colchão de capital. Um fator de 2x significa reservar o dobro do pior drawdown já visto, para ter margem caso o próximo seja maior que qualquer coisa já registrada.'
  },
  sizing: {
    titulo: 'Sizing (dimensionamento de posição)',
    texto: 'Quantos contratos você opera em cada entrada. Sizing variável (mudar a quantidade de operação para operação) mistura o efeito da sua estratégia com o efeito de "apostar mais forte" em certos momentos — dificultando saber qual dos dois está gerando o resultado.'
  },
  normalizado_1_contrato: {
    titulo: 'Normalizado a 1 Contrato',
    texto: 'Recalcular todos os resultados como se cada operação tivesse sido feita com 1 único contrato (1 ponto = R$0,20 no mini índice). Isso remove a variação de tamanho de posição da conta, deixando à vista apenas a qualidade real da estratégia de entrada e saída.'
  }
};

(function () {

  function injetarEstilos() {
    if (document.getElementById('glossario-estilos')) return;
    const style = document.createElement('style');
    style.id = 'glossario-estilos';
    style.textContent = `
      .termo-ajuda-icone{
        display:inline-flex; align-items:center; justify-content:center;
        width:15px; height:15px; border-radius:50%;
        border:1px solid var(--tinta-suave, #5B5A47);
        color:var(--tinta-suave, #5B5A47);
        font-family:'IBM Plex Mono', monospace; font-size:10px; font-weight:600;
        margin-left:5px; cursor:pointer; user-select:none; flex-shrink:0;
        vertical-align:middle; line-height:1; background:transparent;
      }
      .termo-ajuda-icone:hover, .termo-ajuda-icone.aberto{
        background:var(--tinta, #22281F); color:var(--papel, #EDE7D8); border-color:var(--tinta, #22281F);
      }
      .termo-ajuda-popover{
        position:absolute; z-index:9999; max-width:320px;
        background:var(--papel, #EDE7D8); color:var(--tinta, #22281F);
        border:1px solid var(--linha-forte, #AFA689);
        box-shadow:2px 3px 0 rgba(34,40,31,0.12);
        padding:14px 16px; font-family:'IBM Plex Sans', sans-serif;
        font-size:13.5px; line-height:1.55; display:none;
      }
      .termo-ajuda-popover.visivel{ display:block; }
      .termo-ajuda-popover .titulo{
        font-family:'Fraunces', serif; font-weight:600; font-size:15px; margin-bottom:6px;
      }
      .termo-ajuda-popover .fechar{
        position:absolute; top:8px; right:10px; cursor:pointer;
        font-family:'IBM Plex Mono', monospace; font-size:13px; color:var(--tinta-suave, #5B5A47);
      }
      .termo-ajuda-popover .fechar:hover{ color:var(--tinta, #22281F); }
    `;
    document.head.appendChild(style);
  }

  let popoverEl = null;

  function garantirPopover() {
    if (popoverEl) return popoverEl;
    popoverEl = document.createElement('div');
    popoverEl.className = 'termo-ajuda-popover';
    document.body.appendChild(popoverEl);
    return popoverEl;
  }

  function fecharPopover() {
    if (!popoverEl) return;
    popoverEl.classList.remove('visivel');
    document.querySelectorAll('.termo-ajuda-icone.aberto').forEach(function (el) {
      el.classList.remove('aberto');
    });
  }

  function abrirPopover(iconeEl, termoInfo) {
    const pop = garantirPopover();
    const jaAberto = pop.classList.contains('visivel') && pop.dataset.termoAtual === iconeEl.dataset.termoIcone;

    fecharPopover();
    if (jaAberto) return; // clicar de novo no mesmo ícone fecha em vez de reabrir

    pop.innerHTML =
      '<span class="fechar" data-fechar="1">✕</span>' +
      '<div class="titulo">' + termoInfo.titulo + '</div>' +
      '<div class="corpo">' + termoInfo.texto + '</div>';
    pop.dataset.termoAtual = iconeEl.dataset.termoIcone;

    const rect = iconeEl.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    pop.style.display = 'block';
    pop.classList.add('visivel');

    // posiciona abaixo do ícone; se não couber à direita, alinha à esquerda do ícone
    const larguraPopover = pop.offsetWidth || 320;
    let left = rect.left + scrollX;
    if (left + larguraPopover > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - larguraPopover - 16);
    }
    pop.style.top = (rect.bottom + scrollY + 6) + 'px';
    pop.style.left = left + 'px';

    iconeEl.classList.add('aberto');
  }

  function processarElemento(el) {
    if (el.dataset.termoProcessado) return;
    const chave = el.dataset.termo;
    const info = GLOSSARIO_TERMOS[chave];
    if (!info) return; // termo não cadastrado — não quebra a página, só não mostra ícone

    el.dataset.termoProcessado = '1';
    const icone = document.createElement('span');
    icone.className = 'termo-ajuda-icone';
    icone.dataset.termoIcone = chave; // atributo distinto de "termo" — não deve casar com o seletor de escaneamento
    icone.textContent = 'i';
    icone.setAttribute('role', 'button');
    icone.setAttribute('aria-label', 'O que é ' + info.titulo + '?');
    icone.addEventListener('click', function (e) {
      e.stopPropagation();
      abrirPopover(icone, info);
    });
    el.appendChild(icone);
  }

  function escanear() {
    document.querySelectorAll('[data-termo]:not([data-termo-processado]):not(.termo-ajuda-icone)').forEach(processarElemento);
  }

  function iniciar() {
    injetarEstilos();
    escanear();

    // fecha popover ao clicar fora, ou no X
    document.addEventListener('click', function (e) {
      if (e.target && e.target.dataset && e.target.dataset.fechar) {
        fecharPopover();
        return;
      }
      if (popoverEl && !popoverEl.contains(e.target)) {
        fecharPopover();
      }
    });
    window.addEventListener('scroll', fecharPopover, true);
    window.addEventListener('resize', fecharPopover);

    // reescaneia quando páginas injetam conteúdo dinamicamente (ex.: depois de um fetch)
    const observer = new MutationObserver(function () { escanear(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
