const fs = require("fs");
const path = require("path");

const CONFIG = {
  url: "https://app.vendizap.com/webservice/Vitrine/carregarVitrine",
  idUsuario: "66eafec34887036c5220fa95",

  categorias: [
    {
      nome: "Arabic",
      categoria: "67f96dec31eec05a330d4bcb",
      arquivo: "catalogo/arabic.json",
    },
    {
      nome: "Brand",
      categoria: "66eb7c36eaa70632845c4ca",
      arquivo: "catalogo/brand.json",
    },
    {
      nome: "Body Splash",
      categoria: "66ecfd221a781479a43ac285",
      arquivo: "catalogo/bodysplash.json",
    },
  ],

  // Segurança:
  // Não permite substituir um catálogo por uma lista vazia.
  permitirListaVazia: false,

  // Tempo máximo para aguardar a API.
  timeoutMs: 30000,
};

/**
 * Exibe mensagem no console.
 */
function log(mensagem) {
  console.log(`[CATÁLOGO] ${mensagem}`);
}

/**
 * Normaliza o nome para comparação.
 *
 * Exemplos:
 *
 * "A024 - Arabic Royal Amber - 25ml"
 * "Arabic Royal Amber - 25ml"
 *
 * tornam-se:
 *
 * "arabic royal amber - 25ml"
 */
function normalizarNome(nome) {
  return String(nome || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[a-z]\d+\s*-\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula o preço de venda.
 *
 * 49,90 -> 40 + 39,90 = 79,90
 * 59,90 -> 50 + 39,90 = 89,90
 * 69,90 -> 60 + 39,90 = 99,90
 */
function calcularPreco(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return null;
  }

  const primeiraDezena = Math.floor(numero / 10) * 10;

  return primeiraDezena + 39.9;
}

/**
 * Formata o preço no padrão utilizado no catálogo.
 */
function formatarPreco(valor) {
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

/**
 * Lê o JSON atual do catálogo.
 */
function carregarJsonAtual(arquivo) {
  const caminho = path.resolve(process.cwd(), arquivo);

  if (!fs.existsSync(caminho)) {
    log(`Arquivo não existe. Será criado: ${arquivo}`);
    return [];
  }

  try {
    const conteudo = fs.readFileSync(caminho, "utf8");

    if (!conteudo.trim()) {
      return [];
    }

    const json = JSON.parse(conteudo);

    if (!Array.isArray(json)) {
      throw new Error("O conteúdo do JSON não é um array.");
    }

    return json;
  } catch (erro) {
    throw new Error(
      `Erro ao ler ${arquivo}: ${erro.message}`
    );
  }
}

/**
 * Salva o JSON atualizado.
 */
function salvarJson(arquivo, dados) {
  const caminho = path.resolve(process.cwd(), arquivo);
  const diretorio = path.dirname(caminho);

  if (!fs.existsSync(diretorio)) {
    fs.mkdirSync(diretorio, { recursive: true });
  }

  fs.writeFileSync(
    caminho,
    JSON.stringify(dados, null, 4) + "\n",
    "utf8"
  );
}

/**
 * Consulta os produtos de uma categoria no VendiZap.
 *
 * IMPORTANTE:
 * A requisição foi feita de forma equivalente ao AJAX
 * informado pelo usuário:
 *
 * {
 *   "idUsuario": "...",
 *   "categoria": [
 *      "..."
 *   ]
 * }
 */
async function consultarVendiZap(categoria) {
  log(`Consultando VendiZap: ${categoria.nome}`);
  log(`URL: ${CONFIG.url}`);
  log(`Categoria: ${categoria.categoria}`);

  const dadosRequisicao = {
    idUsuario: CONFIG.idUsuario,

    // IMPORTANTE:
    // O VendiZap espera um ARRAY aqui.
    categoria: [categoria.categoria],
  };

  const corpo = JSON.stringify(dadosRequisicao);

  log(`Payload: ${corpo}`);

  let resposta;

  try {
    resposta = await fetch(CONFIG.url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },

      body: corpo,

      signal: AbortSignal.timeout(CONFIG.timeoutMs),
    });
  } catch (erro) {
    let mensagem = erro && erro.message
      ? erro.message
      : String(erro);

    if (erro && erro.cause) {
      if (erro.cause.message) {
        mensagem += ` | causa: ${erro.cause.message}`;
      }

      if (erro.cause.code) {
        mensagem += ` | código: ${erro.cause.code}`;
      }

      if (erro.cause.errno) {
        mensagem += ` | errno: ${erro.cause.errno}`;
      }

      if (erro.cause.syscall) {
        mensagem += ` | syscall: ${erro.cause.syscall}`;
      }

      if (erro.cause.hostname) {
        mensagem += ` | host: ${erro.cause.hostname}`;
      }
    }

    throw new Error(
      `Falha de conexão com o VendiZap: ${mensagem}`
    );
  }

  log(
    `HTTP VendiZap: ${resposta.status} ${resposta.statusText}`
  );

  let textoResposta = "";

  try {
    textoResposta = await resposta.text();
  } catch (erro) {
    throw new Error(
      `Não foi possível ler a resposta do VendiZap: ${erro.message}`
    );
  }

  if (!resposta.ok) {
    throw new Error(
      `VendiZap retornou HTTP ${resposta.status} ${resposta.statusText}. ` +
      `Resposta: ${textoResposta.substring(0, 1000)}`
    );
  }

  let retorno;

  try {
    retorno = JSON.parse(textoResposta);
  } catch (erro) {
    throw new Error(
      `VendiZap não retornou JSON válido. ` +
      `Resposta: ${textoResposta.substring(0, 1000)}`
    );
  }

  if (!retorno) {
    throw new Error(
      "VendiZap retornou uma resposta vazia."
    );
  }

  if (!retorno.listas) {
    throw new Error(
      "Resposta do VendiZap não possui o objeto 'listas'."
    );
  }

  if (!Array.isArray(retorno.listas.listaGaleria)) {
    throw new Error(
      "Resposta do VendiZap não possui 'listas.listaGaleria' como array."
    );
  }

  const quantidadeRecebida =
    retorno.listas.listaGaleria.length;

  log(
    `Produtos recebidos da API: ${quantidadeRecebida}`
  );

  /*
   * Proteção importante.
   *
   * Se a API responder corretamente, mas vier uma lista vazia,
   * não vamos considerar que todos os produtos foram removidos.
   */
  if (
    CONFIG.permitirListaVazia === false &&
    quantidadeRecebida === 0
  ) {
    throw new Error(
      "A API retornou listaGaleria vazia. " +
      "O catálogo não será alterado por segurança."
    );
  }

  return retorno;
}

/**
 * Converte os produtos do VendiZap para o formato do catálogo.
 *
 * Também:
 *
 * - remove produtos sem descrição;
 * - remove decants;
 * - calcula o preço de venda;
 * - pega a primeira imagem.
 */
function transformarVendiZap(retorno) {
  const produtos = retorno.listas.listaGaleria;

  const resultado = [];

  let ignoradosSemDescricao = 0;
  let ignoradosDecant = 0;
  let ignoradosPreco = 0;

  for (const produto of produtos) {
    const descricao = String(
      produto.descricao || ""
    ).trim();

    /*
     * Produto sem descrição não pode ser importado.
     */
    if (!descricao) {
      ignoradosSemDescricao++;
      continue;
    }

    /*
     * Não importar decants.
     */
    if (
      descricao
        .toLowerCase()
        .includes("decant")
    ) {
      ignoradosDecant++;
      continue;
    }

    const preco = calcularPreco(produto.preco);

    if (preco === null) {
      log(
        `Produto ignorado por preço inválido: ${descricao}`
      );

      ignoradosPreco++;
      continue;
    }

    const imagem =
      produto.imagens &&
      Array.isArray(produto.imagens) &&
      produto.imagens.length > 0
        ? produto.imagens[0].link || ""
        : "";

    resultado.push({
      Perfume: descricao,
      Venda: formatarPreco(preco),
      Imagem: imagem,
    });
  }

  log(
    `Após filtros: ${resultado.length} produtos`
  );

  log(
    `Ignorados sem descrição: ${ignoradosSemDescricao}`
  );

  log(
    `Ignorados por serem decants: ${ignoradosDecant}`
  );

  log(
    `Ignorados por preço inválido: ${ignoradosPreco}`
  );

  return resultado;
}

/**
 * Remove duplicidades dos produtos vindos da API.
 *
 * Se a própria API retornar:
 *
 * A024 - Arabic Royal Amber - 25ml
 * Arabic Royal Amber - 25ml
 *
 * os dois terão a mesma chave normalizada.
 */
function deduplicarProdutos(produtos) {
  const mapa = new Map();

  let duplicados = 0;

  for (const produto of produtos) {
    const chave = normalizarNome(
      produto.Perfume
    );

    if (!chave) {
      continue;
    }

    if (mapa.has(chave)) {
      duplicados++;

      log(
        `Duplicidade encontrada na API: ${produto.Perfume}`
      );
    }

    /*
     * Mantém a última informação recebida.
     */
    mapa.set(chave, produto);
  }

  return {
    produtos: Array.from(mapa.values()),
    duplicados,
  };
}

/**
 * Atualiza o catálogo atual utilizando os produtos
 * encontrados no VendiZap.
 *
 * Regras:
 *
 * 1. Produto encontrado:
 *    - mantém o objeto existente;
 *    - atualiza Perfume;
 *    - atualiza Venda;
 *    - atualiza Imagem;
 *    - Ativo = true.
 *
 * 2. Produto antigo que não está mais no VendiZap:
 *    - mantém todos os dados antigos;
 *    - Ativo = false.
 *
 * 3. Produto novo:
 *    - veio da API;
 *    - adiciona no final;
 *    - Ativo = true.
 *
 * 4. Produtos duplicados antigos:
 *    - mantém somente o primeiro;
 *    - remove as duplicidades.
 */
function compararCatalogos(
  catalogoAtual,
  produtosVendiZap
) {
  const resultado = [];

  const deduplicacao = deduplicarProdutos(
    produtosVendiZap
  );

  const produtosNovos = deduplicacao.produtos;

  const mapaNovo = new Map();

  for (const produto of produtosNovos) {
    const chave = normalizarNome(
      produto.Perfume
    );

    if (!chave) {
      continue;
    }

    mapaNovo.set(chave, produto);
  }

  /*
   * Guarda quais produtos do JSON antigo
   * já foram processados.
   */
  const chavesProcessadas = new Set();

  /*
   * Guarda quais produtos da API já foram
   * efetivamente utilizados.
   *
   * Isso garante que somente produtos realmente
   * vindos da API sejam adicionados como novos.
   */
  const chavesEncontradas = new Set();

  let encontrados = 0;
  let inativos = 0;
  let novos = 0;
  let duplicadosRemovidos = 0;

  const produtosInativados = [];
  const produtosAdicionados = [];

  /*
   * PRIMEIRA ETAPA:
   *
   * Percorre o JSON existente.
   *
   * Isso mantém a ordem original dos produtos.
   */
  for (const produtoAntigo of catalogoAtual) {
    const nomeAntigo = String(
      produtoAntigo.Perfume || ""
    ).trim();

    /*
     * Produto antigo sem nome.
     *
     * Mantemos para não apagar informação.
     */
    if (!nomeAntigo) {
      resultado.push({
        ...produtoAntigo,
        Ativo: false,
      });

      inativos++;

      continue;
    }

    const chave = normalizarNome(
      nomeAntigo
    );

    /*
     * Duplicidade no JSON antigo.
     *
     * Mantemos somente a primeira ocorrência.
     */
    if (chavesProcessadas.has(chave)) {
      duplicadosRemovidos++;

      log(
        `Duplicidade removida do JSON antigo: ${nomeAntigo}`
      );

      continue;
    }

    chavesProcessadas.add(chave);

    const produtoNovo = mapaNovo.get(chave);

    /*
     * PRODUTO ENCONTRADO NA API
     */
    if (produtoNovo) {
      /*
       * IMPORTANTE:
       *
       * Mantemos o objeto antigo.
       *
       * Assim, caso futuramente você tenha outros campos
       * personalizados no JSON, eles não serão apagados.
       */
      const produtoAtualizado = {
        ...produtoAntigo,

        Perfume: produtoNovo.Perfume,
        Venda: produtoNovo.Venda,
        Imagem: produtoNovo.Imagem,
        Ativo: true,
      };

      resultado.push(produtoAtualizado);

      chavesEncontradas.add(chave);

      encontrados++;
    }

    /*
     * PRODUTO ANTIGO NÃO ENCONTRADO NA API
     */
    else {
      resultado.push({
        ...produtoAntigo,
        Ativo: false,
      });

      inativos++;

      produtosInativados.push(
        nomeAntigo
      );
    }
  }

  /*
   * SEGUNDA ETAPA:
   *
   * Adiciona somente produtos que:
   *
   * 1. vieram da API;
   * 2. não existiam no JSON antigo.
   */
  for (const produtoNovo of produtosNovos) {
    const chave = normalizarNome(
      produtoNovo.Perfume
    );

    if (!chave) {
      continue;
    }

    /*
     * Já existia no JSON antigo.
     */
    if (chavesProcessadas.has(chave)) {
      continue;
    }

    /*
     * Já foi encontrado anteriormente.
     */
    if (chavesEncontradas.has(chave)) {
      continue;
    }

    /*
     * Produto NOVO.
     *
     * Ele só chegou aqui porque veio da API.
     */
    resultado.push({
      Perfume: produtoNovo.Perfume,
      Venda: produtoNovo.Venda,
      Imagem: produtoNovo.Imagem,
      Ativo: true,
    });

    chavesProcessadas.add(chave);
    chavesEncontradas.add(chave);

    novos++;

    produtosAdicionados.push(
      produtoNovo.Perfume
    );
  }

  return {
    catalogo: resultado,

    estatisticas: {
      totalAnterior: catalogoAtual.length,
      totalVendiZap: produtosNovos.length,
      encontrados,
      novos,
      inativos,
      duplicadosRemovidos:
        duplicadosRemovidos +
        deduplicacao.duplicados,
      totalFinal: resultado.length,
      produtosInativados,
      produtosAdicionados,
    },
  };
}

/**
 * Atualiza uma categoria completa.
 */
async function atualizarCategoria(config) {
  log("");
  log("========================================");
  log(`Atualizando: ${config.nome}`);
  log("========================================");

  /*
   * Primeiro lemos o JSON atual.
   *
   * Ainda não alteramos nada.
   */
  const catalogoAtual =
    carregarJsonAtual(config.arquivo);

  log(
    `Produtos atuais no JSON: ${catalogoAtual.length}`
  );

  /*
   * Consulta a API.
   *
   * Se der erro, a função lança exceção
   * e NÃO chegamos ao salvarJson().
   */
  const retorno =
    await consultarVendiZap(config);

  /*
   * Só chegamos aqui se a API respondeu
   * corretamente.
   */
  const produtosVendiZap =
    transformarVendiZap(retorno);

  /*
   * Proteção adicional.
   *
   * Caso todos os produtos tenham sido filtrados
   * e a API tenha retornado produtos, não vamos
   * automaticamente inativar todo o catálogo.
   */
  if (
    !CONFIG.permitirListaVazia &&
    produtosVendiZap.length === 0
  ) {
    throw new Error(
      "Nenhum produto válido restou após os filtros. " +
      "O catálogo não será alterado por segurança."
    );
  }

  log(
    `Produtos válidos para comparação: ${produtosVendiZap.length}`
  );

  const comparacao =
    compararCatalogos(
      catalogoAtual,
      produtosVendiZap
    );

  /*
   * SOMENTE AGORA o JSON é salvo.
   */
  salvarJson(
    config.arquivo,
    comparacao.catalogo
  );

  const stats =
    comparacao.estatisticas;

  log("");
  log(`Resultado: ${config.nome}`);

  log(
    `- JSON anterior: ${stats.totalAnterior}`
  );

  log(
    `- Produtos recebidos da API: ${stats.totalVendiZap}`
  );

  log(
    `- Encontrados/atualizados: ${stats.encontrados}`
  );

  log(
    `- Produtos novos adicionados: ${stats.novos}`
  );

  log(
    `- Produtos inativados: ${stats.inativos}`
  );

  log(
    `- Duplicidades removidas: ${stats.duplicadosRemovidos}`
  );

  log(
    `- JSON final: ${stats.totalFinal}`
  );

  log(
    `Arquivo: ${config.arquivo}`
  );

  /*
   * Lista produtos adicionados.
   */
  if (stats.produtosAdicionados.length > 0) {
    log("");
    log("Produtos adicionados:");

    for (const nome of stats.produtosAdicionados) {
      log(`  + ${nome}`);
    }
  }

  /*
   * Lista produtos inativados.
   */
  if (stats.produtosInativados.length > 0) {
    log("");
    log("Produtos inativados:");

    for (const nome of stats.produtosInativados) {
      log(`  - ${nome}`);
    }
  }

  return stats;
}

/**
 * Executa todas as categorias.
 */
async function atualizarCatalogos() {
  log("========================================");
  log("INÍCIO DA ATUALIZAÇÃO DOS CATÁLOGOS");
  log("========================================");

  const resumo = [];

  for (const categoria of CONFIG.categorias) {
    try {
      const stats =
        await atualizarCategoria(categoria);

      resumo.push({
        categoria: categoria.nome,
        sucesso: true,
        stats,
      });
    } catch (erro) {
      console.error("");

      console.error(
        `[ERRO] ${categoria.nome}: ${erro.message}`
      );

      resumo.push({
        categoria: categoria.nome,
        sucesso: false,
        erro: erro.message,
      });
    }
  }

  log("");
  log("========================================");
  log("RESUMO FINAL");
  log("========================================");

  for (const item of resumo) {
    if (!item.sucesso) {
      log(`❌ ${item.categoria}: ERRO`);
      log(`   ${item.erro}`);

      continue;
    }

    log(
      `✅ ${item.categoria}: ${item.stats.totalFinal} produtos`
    );
  }

  const houveErro =
    resumo.some(
      (item) => !item.sucesso
    );

  if (houveErro) {
    throw new Error(
      "Uma ou mais categorias não puderam ser atualizadas."
    );
  }

  log("");
  log("========================================");
  log("ATUALIZAÇÃO CONCLUÍDA COM SUCESSO");
  log("========================================");
}

/**
 * Executa o processo.
 */
atualizarCatalogos().catch((erro) => {
  console.error("");
  console.error("========================================");
  console.error("ERRO FATAL");
  console.error("========================================");
  console.error(erro.message);
  console.error("");

  process.exit(1);
});
