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
};

/**
 * Exibe uma mensagem no console.
 */
function log(mensagem) {
  console.log(`[CATÁLOGO] ${mensagem}`);
}

/**
 * Normaliza o nome do produto para comparação.
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
    .replace(/\s+/g, " ");
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
 */
async function consultarVendiZap(categoria) {
  log(`Consultando VendiZap: ${categoria.nome}`);

  const resposta = await fetch(CONFIG.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idUsuario: CONFIG.idUsuario,
      categoria: categoria.categoria,
    }),
  });

  if (!resposta.ok) {
    throw new Error(
      `VendiZap retornou HTTP ${resposta.status} ${resposta.statusText}`
    );
  }

  const retorno = await resposta.json();

  if (
    !retorno ||
    !retorno.listas ||
    !Array.isArray(retorno.listas.listaGaleria)
  ) {
    throw new Error(
      "Resposta do VendiZap não possui listas.listaGaleria."
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

  for (const produto of produtos) {
    const descricao = String(produto.descricao || "").trim();

    if (!descricao) {
      continue;
    }

    /**
     * Não importar decants para o catálogo.
     */
    if (descricao.toLowerCase().includes("decant")) {
      continue;
    }

    const preco = calcularPreco(produto.preco);

    if (preco === null) {
      log(`Produto ignorado por preço inválido: ${descricao}`);
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

  return resultado;
}

/**
 * Remove duplicidades da lista recebida do VendiZap.
 *
 * Isso protege contra uma eventual duplicidade também na própria API.
 */
function deduplicarProdutos(produtos) {
  const mapa = new Map();

  for (const produto of produtos) {
    const chave = normalizarNome(produto.Perfume);

    if (!chave) {
      continue;
    }

    /**
     * Se aparecer duas vezes, mantém a última informação recebida.
     */
    mapa.set(chave, produto);
  }

  return Array.from(mapa.values());
}

/**
 * Atualiza o catálogo atual utilizando os produtos
 * encontrados no VendiZap.
 *
 * Regras:
 *
 * 1. Produto encontrado:
 *    - atualiza Perfume
 *    - atualiza Venda
 *    - atualiza Imagem
 *    - Ativo = true
 *
 * 2. Produto antigo que não está mais no VendiZap:
 *    - mantém os dados antigos
 *    - Ativo = false
 *
 * 3. Produto novo:
 *    - adiciona no final
 *    - Ativo = true
 *
 * 4. Produtos duplicados antigos:
 *    - são consolidados em um único produto.
 */
function compararCatalogos(catalogoAtual, produtosVendiZap) {
  const produtosNovos = deduplicarProdutos(produtosVendiZap);

  /**
   * Mapa dos produtos atuais vindos do VendiZap.
   */
  const mapaNovo = new Map();

  for (const produto of produtosNovos) {
    const chave = normalizarNome(produto.Perfume);

    if (!chave) {
      continue;
    }

    mapaNovo.set(chave, produto);
  }

  /**
   * Aqui vamos construir o novo catálogo.
   *
   * O Set garante que uma chave antiga duplicada
   * também seja processada somente uma vez.
   */
  const resultado = [];

  const chavesProcessadas = new Set();

  let encontrados = 0;
  let inativos = 0;
  let novos = 0;
  let duplicadosRemovidos = 0;

  for (const produtoAntigo of catalogoAtual) {
    const nomeAntigo = String(produtoAntigo.Perfume || "").trim();

    /**
     * Produto antigo sem nome.
     *
     * Não conseguimos identificar corretamente.
     * Mantemos o objeto para não apagar informação
     * existente do usuário.
     */
    if (!nomeAntigo) {
      resultado.push({
        ...produtoAntigo,
        Ativo: false,
      });

      inativos++;
      continue;
    }

    const chave = normalizarNome(nomeAntigo);

    /**
     * Se a mesma chave já apareceu no JSON antigo,
     * temos uma duplicidade.
     */
    if (chavesProcessadas.has(chave)) {
      duplicadosRemovidos++;
      continue;
    }

    chavesProcessadas.add(chave);

    const produtoNovo = mapaNovo.get(chave);

    if (produtoNovo) {
      /**
       * Produto continua existindo no VendiZap.
       *
       * Mantemos somente os campos padronizados
       * do catálogo para produtos encontrados.
       */
      resultado.push({
        Perfume: produtoNovo.Perfume,
        Venda: produtoNovo.Venda,
        Imagem: produtoNovo.Imagem,
        Ativo: true,
      });

      encontrados++;
    } else {
      /**
       * Produto antigo não está mais no VendiZap.
       *
       * Mantemos todos os campos antigos.
       */
      resultado.push({
        ...produtoAntigo,
        Ativo: false,
      });

      inativos++;
    }
  }

  /**
   * Agora adicionamos produtos que nunca existiram
   * no catálogo antigo.
   */
  for (const produtoNovo of produtosNovos) {
    const chave = normalizarNome(produtoNovo.Perfume);

    if (!chave) {
      continue;
    }

    if (chavesProcessadas.has(chave)) {
      continue;
    }

    resultado.push({
      Perfume: produtoNovo.Perfume,
      Venda: produtoNovo.Venda,
      Imagem: produtoNovo.Imagem,
      Ativo: true,
    });

    chavesProcessadas.add(chave);
    novos++;
  }

  return {
    catalogo: resultado,
    estatisticas: {
      totalAnterior: catalogoAtual.length,
      totalVendiZap: produtosNovos.length,
      encontrados,
      novos,
      inativos,
      duplicadosRemovidos,
      totalFinal: resultado.length,
    },
  };
}

/**
 * Atualiza uma categoria completa.
 */
async function atualizarCategoria(config) {
  log("");
  log(`========================================`);
  log(`Atualizando: ${config.nome}`);
  log(`========================================`);

  const catalogoAtual = carregarJsonAtual(config.arquivo);

  log(`Produtos atuais no JSON: ${catalogoAtual.length}`);

  const retorno = await consultarVendiZap(config);

  const produtosVendiZap = transformarVendiZap(retorno);

  log(
    `Produtos recebidos da API após filtros: ${produtosVendiZap.length}`
  );

  const comparacao = compararCatalogos(
    catalogoAtual,
    produtosVendiZap
  );

  salvarJson(
    config.arquivo,
    comparacao.catalogo
  );

  const stats = comparacao.estatisticas;

  log(``);
  log(`Resultado: ${config.nome}`);
  log(`- JSON anterior: ${stats.totalAnterior}`);
  log(`- VendiZap: ${stats.totalVendiZap}`);
  log(`- Encontrados/atualizados: ${stats.encontrados}`);
  log(`- Produtos novos: ${stats.novos}`);
  log(`- Produtos inativados: ${stats.inativos}`);
  log(`- Duplicidades removidas: ${stats.duplicadosRemovidos}`);
  log(`- JSON final: ${stats.totalFinal}`);
  log(`Arquivo: ${config.arquivo}`);

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
      const stats = await atualizarCategoria(categoria);

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

  const houveErro = resumo.some(
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
