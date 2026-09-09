"use strict";

const CONFIG = {
  url: "https://app.vendizap.com/webservice/Vitrine/carregarVitrine",

  idUsuario: "66eafec34887036c5220fa95",

  catalogos: {
    arabic: {
      nome: "Arabic",
      categoria: "67f96dec31eec05a330d4bcb",
      arquivo: "../catalogo/arabic.json",
    },

    brand: {
      nome: "Brand",
      categoria: "66eb7c36eaa70632845c4ca",
      arquivo: "../catalogo/brand.json",
    },
    bodysplash: {
      nome: "Body Splash",
      categoria: "66ecfd221a781479a43ac285",
      arquivo: "../catalogo/bodysplash.json",
    },
  },
};

function log(mensagem) {
  const elemento = document.getElementById("log");

  if (!elemento) {
    return;
  }

  const agora = new Date().toLocaleTimeString("pt-BR");

  elemento.textContent += `[${agora}] ${mensagem}\n`;
}

function definirStatus(mensagem, tipo = "") {
  const elemento = document.getElementById("status");

  if (!elemento) {
    return;
  }

  elemento.textContent = mensagem;

  elemento.className = "status " + tipo;
}

function transformarVendiZap(retorno) {
    if (!retorno || !retorno.listas || !Array.isArray(retorno.listas.listaGaleria)) {
        throw new Error("A resposta da VendiZap não possui listas.listaGaleria como array.");
    }
    const produtos = retorno.listas.listaGaleria;
    return produtos
        .filter(produto => {

            if (!produto || !produto.descricao) {
                return false;
            }
            // Não importar produtos com "Decant" no nome
            return !produto.descricao
                .toLowerCase()
                .includes("decant");
        })
        .map(produto => {
            return {
                Perfume: produto.descricao.trim(),
                Venda: formatarPreco(calcularPreco(produto.preco)),
                Imagem: obterImagem(produto)
            };
        });
}

function calcularPreco(preco) {
  if (preco === null || preco === undefined) {
    return null;
  }

  let valorTexto = String(preco).trim().replace("R$", "").trim();

  if (valorTexto.includes(",") && valorTexto.includes(".")) {
    valorTexto = valorTexto.replace(/\./g, "").replace(",", ".");
  } else {

    valorTexto = valorTexto.replace(",", ".");
  }

  const valor = Number(valorTexto);

  if (!Number.isFinite(valor)) {
    return null;
  }

  const primeiraDezena = Math.floor(valor / 10) * 10;

  return primeiraDezena + 39.9;
}


function formatarPreco(valor) {
  if (valor === null) {
    return "";
  }

  return "R$ " + valor.toFixed(2).replace(".", ",");
}

async function buscarVendiZap(categoria) {
  const resposta = await fetch(CONFIG.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idUsuario: CONFIG.idUsuario,
      categoria: [categoria],
    }),
  });
  if (!resposta.ok) {
    throw new Error(`VendiZap retornou HTTP ${resposta.status}`);
  }
  return await resposta.json();
}

async function carregarJsonAtual(arquivo) {
  try {
    const resposta = await fetch(arquivo + "?atualizacao=" + Date.now());
    if (!resposta.ok) {
      if (resposta.status === 404) {
        log(`Arquivo ${arquivo} ainda não existe. Será criado do zero.`);
        return [];
      }
      throw new Error(`Erro HTTP ${resposta.status} ao carregar ${arquivo}`);
    }
    const dados = await resposta.json();
    if (!Array.isArray(dados)) {
      throw new Error(`${arquivo} não possui um array JSON válido.`);
    }
    return dados;
  } catch (erro) {
    console.warn("Erro ao carregar JSON atual:", erro);
    if (erro.message && erro.message.includes("não existe")) {
      return [];
    }
    throw erro;
  }
}

function obterImagem(produto) {
  if (!produto || !Array.isArray(produto.imagens)) {
    return "";
  }
  if (produto.imagens.length === 0) {
    return "";
  }
  return produto.imagens[0]?.link || "";
}

function normalizarNome(nome) {
  return String(nome || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]\d+\s*-\s*/i, "")
    .replace(/\s+/g, " ");
}

function compararCatalogos(atual, novo) {
  const mapaNovo = new Map();
  novo.forEach((produto) => {
    const chave = normalizarNome(produto.Perfume);
    if (chave !== "") {
      mapaNovo.set(chave, produto);
    }
  });
  const resultado = [];
  const encontrados = new Set();
  atual.forEach((produtoAtual) => {
    const chave = normalizarNome(produtoAtual.Perfume);
    if (chave === "") {
      return;
    }
    const produtoNovo = mapaNovo.get(chave);
    if (produtoNovo) {
      resultado.push({
        Perfume: produtoNovo.Perfume,
        Venda: produtoNovo.Venda,
        Imagem: produtoNovo.Imagem,
        Ativo: true,
      });
      encontrados.add(chave);
    } else {
      resultado.push({
        ...produtoAtual,
        Ativo: false,
      });
    }
  });
  novo.forEach((produtoNovo) => {
    const chave = normalizarNome(produtoNovo.Perfume);
    if (chave === "" || encontrados.has(chave)) {
      return;
    }
    resultado.push({
      Perfume: produtoNovo.Perfume,
      Venda: produtoNovo.Venda,
      Imagem: produtoNovo.Imagem,
      Ativo: true,
    });
    encontrados.add(chave);
  });
  return resultado;
}

function obterEstatisticas(atual, novo, resultado) {
  let ativos = 0;
  let inativos = 0;
  let novos = 0;
  resultado.forEach((produto) => {
    if (produto.Ativo === false) {
      inativos++;
    } else {
      ativos++;
    }
  });
  const nomesAtuais = new Set();
  atual.forEach((produto) => {
    const nome = normalizarNome(produto.Perfume);
    if (nome !== "") {
      nomesAtuais.add(nome);
    }
  });
  novo.forEach((produto) => {
    const nome = normalizarNome(produto.Perfume);
    if (nome !== "" && !nomesAtuais.has(nome)) {
      novos++;
    }
  });
  return {
    total: resultado.length,
    ativos: ativos,
    inativos: inativos,
    novos: novos,
  };
}

function mostrarEstatisticas(tipo, estatisticas) {
  const elemento = document.getElementById(
    tipo === "arabic" ? "estatisticasArabic" : "estatisticasBrand",
  );
  if (!elemento) {
    return;
  }
  elemento.innerHTML = `
        <span class="badge">
            Total: ${estatisticas.total}
        </span>
        <span class="badge ativo">
            Ativos: ${estatisticas.ativos}
        </span>
        <span class="badge inativo">
            Inativos: ${estatisticas.inativos}
        </span>
        <span class="badge novo">
            Novos: ${estatisticas.novos}
        </span>
    `;
}

async function atualizarCatalogo(tipo, config) {
  log(`========== ${config.nome.toUpperCase()} ==========`);
  log(`Lendo ${config.arquivo}...`);
  const atual = await carregarJsonAtual(config.arquivo);
  log(`${config.nome}: ${atual.length} produtos no JSON atual.`);
  log(`Consultando VendiZap - ${config.nome}...`);
  const retorno = await buscarVendiZap(config.categoria);
  log(`${config.nome}: resposta recebida.`);
  const novo = transformarVendiZap(retorno);
  log(`${config.nome}: ${novo.length} produtos válidos após remover decants.`);
  const resultado = compararCatalogos(atual, novo);
  const estatisticas = obterEstatisticas(atual, novo, resultado);
  const json = JSON.stringify(resultado, null, 4);
  const campo = document.getElementById(
    tipo === "arabic" ? "jsonArabic" : "jsonBrand",
  );
  if (campo) {
    campo.value = json;
  }
  mostrarEstatisticas(tipo, estatisticas);
  log(`${config.nome}: ${estatisticas.total} produtos no JSON final.`);
  log(`${config.nome}: ${estatisticas.ativos} ativos.`);
  log(`${config.nome}: ${estatisticas.inativos} inativos.`);
  log(`${config.nome}: ${estatisticas.novos} novos.`);
  return resultado;
}

async function atualizarCatalogos() {
  const botao = document.getElementById("btnAtualizar");
  const logElemento = document.getElementById("log");
  if (logElemento) {
    logElemento.textContent = "";
  }
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Atualizando...";
  }
  definirStatus("Consultando VendiZap...", "");
  try {
    log("Iniciando atualização dos catálogos.");
    await atualizarCatalogo("arabic", CONFIG.catalogos.arabic);
    await atualizarCatalogo("brand", CONFIG.catalogos.brand);
    await atualizarCatalogo("bodysplash", CONFIG.catalogos.bodysplash);
    log("========================================");
    log("Atualização concluída com sucesso.");
    definirStatus("Catálogos atualizados com sucesso.", "sucesso");
  } catch (erro) {
    console.error(erro);
    log("ERRO: " + (erro?.message || erro));
    definirStatus("Erro durante a atualização.", "erro");
    alert(
      "Não foi possível atualizar os catálogos.\n\n" + (erro?.message || erro),
    );
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = "Atualizar catálogos";
    }
  }
}

async function copiarJson(id, botao) {
  const campo = document.getElementById(id);

  if (!campo || !campo.value) {
    alert("Não existe JSON para copiar.");
    return;
  }

  try {
    await navigator.clipboard.writeText(campo.value);
    if (botao) {
      const textoOriginal = botao.textContent;
      botao.textContent = "Copiado!";
      setTimeout(() => {
        botao.textContent = textoOriginal;
      }, 1500);
    }
  } catch (erro) {
    campo.focus();
    campo.select();
    document.execCommand("copy");
    if (botao) {
      const textoOriginal = botao.textContent;
      botao.textContent = "Copiado!";
      setTimeout(() => {
        botao.textContent = textoOriginal;
      }, 1500);
    }
  }
}
