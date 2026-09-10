const fs = require("fs");
const path = require("path");

const CONFIG = {
    url: "https://app.vendizap.com/webservice/Vitrine/carregarVitrine",

    idUsuario: "66eafec34887036c5220fa95",

    categorias: [{
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

    /*
     * Quantidade máxima de produtos por página.
     *
     * Descoberto através da resposta da API:
     * qtdPaginaGerais = 40
     */
    produtosPorPagina: 40,

    /*
     * Aparentemente a primeira página é 1.
     */
    paginaInicial: 1,

    /*
     * Tempo máximo para cada requisição.
     */
    timeoutMs: 30000,

    /*
     * Segurança:
     *
     * Se a API retornar zero produtos, não altera o catálogo.
     */
    permitirListaVazia: false,
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
 * A024 - Arabic Royal Amber - 25ml
 * Arabic Royal Amber - 25ml
 *
 * tornam-se:
 *
 * arabic royal amber - 25ml
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

    const primeiraDezena =
        Math.floor(numero / 10) * 10;

    return primeiraDezena + 39.9;
}

/**
 * Formata o preço.
 */
function formatarPreco(valor) {
    return `R$ ${Number(valor)
    .toFixed(2)
    .replace(".", ",")}`;
}

/**
 * Carrega o JSON atual.
 */
function carregarJsonAtual(arquivo) {
    const caminho = path.resolve(
        process.cwd(),
        arquivo
    );

    if (!fs.existsSync(caminho)) {
        log(
            `Arquivo não existe. Será criado: ${arquivo}`
        );

        return [];
    }

    try {
        const conteudo =
            fs.readFileSync(
                caminho,
                "utf8"
            );

        if (!conteudo.trim()) {
            return [];
        }

        const json =
            JSON.parse(conteudo);

        if (!Array.isArray(json)) {
            throw new Error(
                "O conteúdo do JSON não é um array."
            );
        }

        return json;
    } catch (erro) {
        throw new Error(
            `Erro ao ler ${arquivo}: ${erro.message}`
        );
    }
}

/**
 * Salva o JSON.
 */
function salvarJson(arquivo, dados) {
    const caminho = path.resolve(
        process.cwd(),
        arquivo
    );

    const diretorio =
        path.dirname(caminho);

    if (!fs.existsSync(diretorio)) {
        fs.mkdirSync(
            diretorio, {
                recursive: true,
            }
        );
    }

    fs.writeFileSync(
        caminho,
        JSON.stringify(
            dados,
            null,
            4
        ) + "\n",
        "utf8"
    );
}

/**
 * Faz uma requisição para uma página específica
 * do VendiZap.
 */
async function consultarPaginaVendiZap(
    categoria,
    pagina
) {
    const dadosRequisicao = {
        idUsuario: CONFIG.idUsuario,

        /*
         * IMPORTANTE:
         * A API espera categoria como ARRAY.
         */
        categoria: [
            categoria.categoria,
        ],

        /*
         * Paginação descoberta na API.
         */
        qtdPaginaGerais: CONFIG.produtosPorPagina,
        paginaGerais: pagina,
        ordenacao: {
            descricao: "A - Z",
            tipo: "descricao",
            ordem: "asc",
        },
    };

    const corpo =
        JSON.stringify(
            dadosRequisicao
        );

    log(
        `Consultando ${categoria.nome} - página ${pagina}`
    );

    log(
        `Payload: ${corpo}`
    );

    let resposta;

    try {
        resposta = await fetch(
            CONFIG.url, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    "Accept": "application/json",
                },

                body: corpo,

                signal: AbortSignal.timeout(
                    CONFIG.timeoutMs
                ),
            }
        );
    } catch (erro) {
        let mensagem =
            erro &&
            erro.message ?
            erro.message :
            String(erro);

        if (erro && erro.cause) {
            if (erro.cause.message) {
                mensagem +=
                    ` | causa: ${erro.cause.message}`;
            }

            if (erro.cause.code) {
                mensagem +=
                    ` | código: ${erro.cause.code}`;
            }

            if (erro.cause.errno) {
                mensagem +=
                    ` | errno: ${erro.cause.errno}`;
            }

            if (erro.cause.syscall) {
                mensagem +=
                    ` | syscall: ${erro.cause.syscall}`;
            }

            if (erro.cause.hostname) {
                mensagem +=
                    ` | host: ${erro.cause.hostname}`;
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
        textoResposta =
            await resposta.text();
    } catch (erro) {
        throw new Error(
            `Não foi possível ler a resposta do VendiZap: ${erro.message}`
        );
    }

    if (!resposta.ok) {
        throw new Error(
            `VendiZap retornou HTTP ${resposta.status} ${resposta.statusText}. ` +
            `Resposta: ${textoResposta.substring(
        0,
        1000
      )}`
        );
    }

    let retorno;

    try {
        retorno =
            JSON.parse(
                textoResposta
            );
    } catch (erro) {
        throw new Error(
            `VendiZap não retornou JSON válido. ` +
            `Resposta: ${textoResposta.substring(
        0,
        1000
      )}`
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

    if (
        !Array.isArray(
            retorno.listas.listaGaleria
        )
    ) {
        throw new Error(
            "Resposta do VendiZap não possui 'listas.listaGaleria' como array."
        );
    }

    /*
     * quantidadePaginacao representa
     * a quantidade total de produtos.
     */
    const quantidadeTotal =
        Number(
            retorno.quantidadePaginacao
        );

    if (
        !Number.isFinite(
            quantidadeTotal
        )
    ) {
        throw new Error(
            "A resposta do VendiZap não possui 'quantidadePaginacao' válido."
        );
    }

    log(
        `Página ${pagina}: ${retorno.listas.listaGaleria.length} produtos`
    );

    log(
        `Total informado pela API: ${quantidadeTotal}`
    );

    return retorno;
}

/**
 * Consulta TODAS as páginas de uma categoria.
 *
 * Exemplo:
 *
 * quantidadePaginacao = 67
 * produtosPorPagina = 40
 *
 * Math.ceil(67 / 40) = 2
 *
 * Então:
 *
 * página 1
 * página 2
 */
async function consultarVendiZap(categoria) {
  /*
   * Primeiro consulta a página inicial.
   */
  const primeiraPagina = await consultarPaginaVendiZap(
    categoria,
    CONFIG.paginaInicial
  );

  const primeiraLista =
    primeiraPagina.listas.listaGaleria;

  const quantidadeTotal =
    Number(primeiraPagina.quantidadePaginacao);

  const totalPaginas = Math.ceil(
    quantidadeTotal / CONFIG.produtosPorPagina
  );

  log("");
  log(
    `Total de produtos informado pela API: ${quantidadeTotal}`
  );

  log(
    `Produtos por página: ${CONFIG.produtosPorPagina}`
  );

  log(
    `Total de páginas informado pela API: ${totalPaginas}`
  );

  /*
   * Se a PRIMEIRA página vier vazia,
   * não temos dados suficientes para atualizar
   * o catálogo com segurança.
   */
  if (primeiraLista.length === 0) {
    throw new Error(
      "A primeira página da API veio vazia. O catálogo não será alterado."
    );
  }

  /*
   * Começa com os produtos da primeira página.
   */
  const todosProdutos = [
    ...primeiraLista,
  ];

  /*
   * Consulta as páginas seguintes.
   */
  for (
    let pagina = CONFIG.paginaInicial + 1;
    pagina <= totalPaginas;
    pagina++
  ) {
    const retorno = await consultarPaginaVendiZap(
      categoria,
      pagina
    );

    const produtosPagina =
      retorno.listas.listaGaleria;

    /*
     * Se uma página posterior vier vazia,
     * consideramos que chegamos ao fim.
     *
     * NÃO é erro.
     *
     * Processamos tudo o que já foi encontrado.
     */
    if (produtosPagina.length === 0) {
      log("");
      log(
        `⚠️ Página ${pagina} veio vazia.`
      );

      log(
        `⚠️ Considerando a página ${pagina - 1} como a última página disponível.`
      );

      break;
    }

    /*
     * Adiciona os produtos encontrados
     * nessa página.
     */
    todosProdutos.push(
      ...produtosPagina
    );
  }

  log("");
  log(
    `Total de produtos coletados: ${todosProdutos.length}`
  );

  log(
    `Total de páginas efetivamente processadas: ${
      todosProdutos.length > 0
        ? Math.ceil(
            todosProdutos.length /
              CONFIG.produtosPorPagina
          )
        : 0
    }`
  );

  /*
   * Retorna tudo que foi encontrado.
   */
  return {
    quantidadePaginacao:
      quantidadeTotal,

    quantidadePaginas:
      totalPaginas,

    produtos:
      todosProdutos,
  };
}

function limparDescricao(descricao) {
    return String(descricao || "")
        .replace(/\u00A0/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * Transforma os produtos recebidos da API
 * no formato do catálogo.
 *
 * Filtros:
 *
 * - sem descrição = ignora
 * - contendo "decant" = ignora
 */
function transformarVendiZap(
    dados
) {
    const produtos =
        dados.produtos;

    const resultado = [];

    let ignoradosSemDescricao = 0;
    let ignoradosDecant = 0;
    let ignoradosPreco = 0;

    for (
        const produto of produtos
    ) {
        const descricao = limparDescricao(produto.descricao);

        /*
         * Sem descrição.
         */
        if (!descricao) {
            ignoradosSemDescricao++;
            continue;
        }

        /*
         * Decants.
         */
        if (
            descricao
            .toLowerCase()
            .includes("decant")
        ) {
            ignoradosDecant++;
            continue;
        }

        /*
         * Calcula preço.
         */
        const preco =
            calcularPreco(
                produto.preco
            );

        if (preco === null) {
            log(
                `Produto ignorado por preço inválido: ${descricao}`
            );

            ignoradosPreco++;

            continue;
        }

        /*
         * Primeira imagem.
         */
        const imagem =
            produto.imagens &&
            Array.isArray(
                produto.imagens
            ) &&
            produto.imagens.length > 0 ?
            produto.imagens[0].link ||
            "" :
            "";

        resultado.push({
            Perfume: descricao,

            Venda: formatarPreco(
                preco
            ),

            Imagem: imagem,
        });
    }

    log("");
    log(
        `Produtos válidos após filtros: ${resultado.length}`
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
 * Remove duplicidades dos produtos
 * recebidos pela API.
 */
function deduplicarProdutos(
    produtos
) {
    const mapa =
        new Map();

    let duplicados = 0;

    for (
        const produto of produtos
    ) {
        const chave =
            normalizarNome(
                produto.Perfume
            );

        if (!chave) {
            continue;
        }

        if (
            mapa.has(chave)
        ) {
            duplicados++;

            log(
                `Duplicidade encontrada na API: ${produto.Perfume}`
            );
        }

        mapa.set(
            chave,
            produto
        );
    }

    return {
        produtos: Array.from(
            mapa.values()
        ),

        duplicados,
    };
}

/**
 * Compara o catálogo antigo
 * com os produtos da API.
 */
function compararCatalogos(
    catalogoAtual,
    produtosVendiZap
) {
    const resultado = [];

    /*
     * Primeiro remove duplicidades
     * vindas da própria API.
     */
    const deduplicacao =
        deduplicarProdutos(
            produtosVendiZap
        );

    const produtosNovos =
        deduplicacao.produtos;

    /*
     * Mapa da API.
     */
    const mapaNovo =
        new Map();

    for (
        const produto of produtosNovos
    ) {
        const chave =
            normalizarNome(
                produto.Perfume
            );

        if (!chave) {
            continue;
        }

        mapaNovo.set(
            chave,
            produto
        );
    }

    /*
     * Guarda os produtos antigos
     * já processados.
     */
    const chavesProcessadas =
        new Set();

    /*
     * Guarda os produtos da API
     * encontrados no catálogo.
     */
    const chavesEncontradas =
        new Set();

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
     */
    for (
        const produtoAntigo of catalogoAtual
    ) {
        const nomeAntigo =
            String(
                produtoAntigo.Perfume ||
                ""
            ).trim();

        /*
         * Produto sem nome.
         */
        if (!nomeAntigo) {
            resultado.push({
                ...produtoAntigo,
                Ativo: false,
            });

            inativos++;

            continue;
        }

        const chave =
            normalizarNome(
                nomeAntigo
            );

        /*
         * Se o JSON antigo possui
         * duas versões do mesmo produto,
         * mantém apenas a primeira.
         */
        if (
            chavesProcessadas.has(
                chave
            )
        ) {
            duplicadosRemovidos++;

            log(
                `Duplicidade removida do JSON antigo: ${nomeAntigo}`
            );

            continue;
        }

        chavesProcessadas.add(
            chave
        );

        /*
         * Procura na API.
         */
        const produtoNovo =
            mapaNovo.get(
                chave
            );

        /*
         * ENCONTRADO NA API
         */
        if (produtoNovo) {
            /*
             * Preserva o objeto antigo
             * e seus demais campos.
             */
            const produtoAtualizado = {
                ...produtoAntigo,

                Perfume: produtoNovo.Perfume,

                Venda: produtoNovo.Venda,

                Imagem: produtoNovo.Imagem,

                Ativo: true,
            };

            resultado.push(
                produtoAtualizado
            );

            chavesEncontradas.add(
                chave
            );

            encontrados++;
        }

        /*
         * NÃO ENCONTRADO NA API
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
     * Adiciona somente produtos
     * realmente vindos da API que
     * não existiam no JSON antigo.
     */
    for (
        const produtoNovo of produtosNovos
    ) {
        const chave =
            normalizarNome(
                produtoNovo.Perfume
            );

        if (!chave) {
            continue;
        }

        /*
         * Já existia no JSON.
         */
        if (
            chavesProcessadas.has(
                chave
            )
        ) {
            continue;
        }

        /*
         * Já encontrado.
         */
        if (
            chavesEncontradas.has(
                chave
            )
        ) {
            continue;
        }

        /*
         * Produto realmente novo.
         *
         * Ele veio da API.
         */
        resultado.push({
            Perfume: produtoNovo.Perfume,

            Venda: produtoNovo.Venda,

            Imagem: produtoNovo.Imagem,

            Ativo: true,
        });

        chavesProcessadas.add(
            chave
        );

        chavesEncontradas.add(
            chave
        );

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

            duplicadosRemovidos: duplicadosRemovidos +
                deduplicacao.duplicados,

            totalFinal: resultado.length,

            produtosInativados,

            produtosAdicionados,
        },
    };
}

/**
 * Atualiza uma categoria.
 */
async function atualizarCategoria(
    config
) {
    log("");
    log(
        "========================================"
    );

    log(
        `Atualizando: ${config.nome}`
    );

    log(
        "========================================"
    );

    /*
     * Carrega o JSON atual.
     */
    const catalogoAtual =
        carregarJsonAtual(
            config.arquivo
        );

    log(
        `Produtos atuais no JSON: ${catalogoAtual.length}`
    );

    /*
     * Consulta TODAS as páginas.
     *
     * Se houver qualquer erro,
     * esta função lança exceção
     * e o JSON não é salvo.
     */
    const dadosVendiZap =
        await consultarVendiZap(
            config
        );

    /*
     * Segurança adicional.
     */
    if (
        !CONFIG.permitirListaVazia &&
        dadosVendiZap.produtos.length === 0
    ) {
        throw new Error(
            "A API retornou nenhum produto. O catálogo não será alterado por segurança."
        );
    }

    /*
     * Transforma os produtos.
     */
    const produtosVendiZap =
        transformarVendiZap(
            dadosVendiZap
        );

    /*
     * Se havia produtos na API,
     * mas todos foram eliminados
     * pelos filtros, não vamos
     * inativar todo o catálogo.
     */
    if (
        !CONFIG.permitirListaVazia &&
        produtosVendiZap.length === 0
    ) {
        throw new Error(
            "Nenhum produto válido restou após os filtros. O catálogo não será alterado por segurança."
        );
    }

    /*
     * Compara.
     */
    const comparacao =
        compararCatalogos(
            catalogoAtual,
            produtosVendiZap
        );

    /*
     * SOMENTE agora salvamos.
     */
    salvarJson(
        config.arquivo,
        comparacao.catalogo
    );

    const stats =
        comparacao.estatisticas;

    log("");
    log(
        `Resultado: ${config.nome}`
    );

    log(
        `- JSON anterior: ${stats.totalAnterior}`
    );

    log(
        `- Total informado pela API: ${dadosVendiZap.quantidadePaginacao}`
    );

    log(
        `- Total de páginas consultadas: ${dadosVendiZap.quantidadePaginas}`
    );

    log(
        `- Produtos coletados: ${dadosVendiZap.produtos.length}`
    );

    log(
        `- Produtos válidos: ${stats.totalVendiZap}`
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
        `- Arquivo: ${config.arquivo}`
    );

    /*
     * Produtos adicionados.
     */
    if (
        stats.produtosAdicionados.length >
        0
    ) {
        log("");
        log(
            "Produtos adicionados:"
        );

        for (
            const nome of stats.produtosAdicionados
        ) {
            log(
                `  + ${nome}`
            );
        }
    }

    /*
     * Produtos inativados.
     */
    if (
        stats.produtosInativados.length >
        0
    ) {
        log("");
        log(
            "Produtos inativados:"
        );

        for (
            const nome of stats.produtosInativados
        ) {
            log(
                `  - ${nome}`
            );
        }
    }

    return stats;
}

/**
 * Atualiza todas as categorias.
 */
async function atualizarCatalogos() {
    log(
        "========================================"
    );

    log(
        "INÍCIO DA ATUALIZAÇÃO DOS CATÁLOGOS"
    );

    log(
        "========================================"
    );

    const resumo = [];

    for (
        const categoria of CONFIG.categorias
    ) {
        try {
            const stats =
                await atualizarCategoria(
                    categoria
                );

            resumo.push({
                categoria: categoria.nome,

                sucesso: true,

                stats,
            });
        } catch (erro) {
            console.error("");

            console.error(
                `[CATÁLOGO] ❌ ${categoria.nome}: ERRO`
            );

            console.error(
                `[CATÁLOGO]    ${erro.message}`
            );

            resumo.push({
                categoria: categoria.nome,

                sucesso: false,

                erro: erro.message,
            });
        }
    }

    log("");
    log(
        "========================================"
    );

    log(
        "RESUMO FINAL"
    );

    log(
        "========================================"
    );

    for (
        const item of resumo
    ) {
        if (!item.sucesso) {
            log(
                `❌ ${item.categoria}: ERRO`
            );

            log(
                `   ${item.erro}`
            );

            continue;
        }

        log(
            `✅ ${item.categoria}: ${item.stats.totalFinal} produtos`
        );
    }

    const houveErro =
        resumo.some(
            (item) =>
            !item.sucesso
        );

    if (houveErro) {
        throw new Error(
            "Uma ou mais categorias não puderam ser atualizadas."
        );
    }

    log("");
    log(
        "========================================"
    );

    log(
        "ATUALIZAÇÃO CONCLUÍDA COM SUCESSO"
    );

    log(
        "========================================"
    );
}

/**
 * Executa.
 */
atualizarCatalogos().catch(
    (erro) => {
        console.error("");
        console.error(
            "========================================"
        );

        console.error(
            "ERRO FATAL"
        );

        console.error(
            "========================================"
        );

        console.error(
            erro.message
        );

        console.error("");

        process.exit(1);
    }
);
