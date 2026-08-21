/**
 * Monta o pacote de instalação do ComerciON para Windows, sem Docker.
 *
 * O DEPLOY.md cobre o servidor de verdade: Linux, domínio próprio, HTTPS
 * automático. Nada disso existe num computador de teste em cima da mesa — e
 * era justamente aí que não havia caminho.
 *
 * O que sai daqui é uma pasta que roda numa máquina que só tem Node e
 * PostgreSQL instalados. Nenhum `npm install` acontece no destino: as
 * dependências vão dentro do pacote, já resolvidas.
 *
 * POR QUE `npm install` E NÃO `pnpm deploy`
 * O projeto usa pnpm, cujo node_modules é uma árvore de links para um store
 * central. Copiar isso para outra máquina não funciona — os links apontam
 * para caminhos que não existem lá. O `pnpm deploy`, que existe para
 * resolver isso, está quebrado no Windows: com caminho absoluto ele monta o
 * destino concatenado ao diretório do pacote, e com caminho relativo espalha
 * a saída em duas pastas diferentes (medido nas duas formas). O `npm install`
 * numa pasta limpa produz uma árvore real, sem link nenhum, que sobrevive a
 * um zip.
 *
 * Uso:
 *   node scripts/gerar-pacote-windows.mjs [pasta-de-saida]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(process.argv[2] ?? join(RAIZ, 'pacote-windows'));
const SISTEMA = join(SAIDA, 'sistema');

/** O painel é compilado com este endereço embutido — só esta máquina o acessa. */
const API_URL = 'http://localhost:3001';

function passo(titulo) {
  console.log(`\n=== ${titulo}`);
}

function rodar(comando, args, opcoes = {}) {
  execFileSync(comando, args, { stdio: 'inherit', shell: true, ...opcoes });
}

/**
 * package.json enxuto para o destino: só as dependências de produção, sem
 * scripts que dependam de ferramentas ausentes lá (nest, ts-node, jest).
 */
function packageJsonDeProducao(origem, extras = {}) {
  const pkg = JSON.parse(readFileSync(origem, 'utf8'));
  return JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      private: true,
      dependencies: pkg.dependencies,
      ...extras,
    },
    null,
    2,
  );
}

if (existsSync(SAIDA)) {
  console.log(`Apagando pacote anterior em ${SAIDA}`);
  rmSync(SAIDA, { recursive: true, force: true });
}
mkdirSync(SISTEMA, { recursive: true });

// ---------------------------------------------------------------- compilar
passo('Compilando a API');
rodar('npx', ['prisma', 'generate'], { cwd: join(RAIZ, 'apps/api') });
rodar('npx', ['nest', 'build'], { cwd: join(RAIZ, 'apps/api') });

passo('Compilando o painel');
rodar('npx', ['next', 'build'], {
  cwd: join(RAIZ, 'apps/web'),
  env: { ...process.env, NEXT_PUBLIC_API_URL: API_URL, NEXT_PUBLIC_TENANT_BASE_DOMAIN: '' },
});

// -------------------------------------------------------------------- API
passo('Montando a API do pacote');
const destinoApi = join(SISTEMA, 'api');
mkdirSync(destinoApi, { recursive: true });
writeFileSync(join(destinoApi, 'package.json'), packageJsonDeProducao(join(RAIZ, 'apps/api/package.json')));
rodar('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: destinoApi });

cpSync(join(RAIZ, 'apps/api/dist'), join(destinoApi, 'dist'), { recursive: true });
// O schema e as migrations viajam junto: é com eles que o INSTALAR cria as
// tabelas no computador de destino.
cpSync(join(RAIZ, 'apps/api/prisma'), join(destinoApi, 'prisma'), {
  recursive: true,
  filter: (caminho) => !caminho.endsWith('seed.ts'),
});

// O schema do repositório pede DOIS engines: o da máquina e o do Alpine, que
// a imagem Docker usa. Aqui só existe Windows — carregar o do Linux é peso
// morto, e foi ele que mascarou o defeito abaixo na primeira montagem.
const schemaDoPacote = join(destinoApi, 'prisma/schema.prisma');
writeFileSync(
  schemaDoPacote,
  readFileSync(schemaDoPacote, 'utf8').replace(
    /binaryTargets = \[[^\]]*\]/,
    'binaryTargets = ["native"] // pacote Windows: só o engine desta plataforma',
  ),
);

passo('Gerando o cliente do Prisma dentro do pacote');
// Precisa rodar AQUI, contra o node_modules do pacote: o cliente gerado
// carrega o engine nativo, e é esse par que vai para o destino.
//
// Na primeira montagem isto saiu SEM o engine do Windows: o npm bloqueou o
// postinstall do @prisma/engines, o binário ainda não tinha sido baixado, e o
// generate seguiu em frente sem reclamar. O pacote ficaria pronto e só
// quebraria na primeira consulta ao banco, no computador de teste. Por isso a
// conferência logo abaixo — e por isso ela falha o build, em vez de avisar.
const engineDoWindows = join(destinoApi, 'node_modules/.prisma/client/query_engine-windows.dll.node');
for (let tentativa = 1; tentativa <= 2 && !existsSync(engineDoWindows); tentativa++) {
  rodar('npx', ['--yes', 'prisma@5.22.0', 'generate'], { cwd: destinoApi });
}
if (!existsSync(engineDoWindows)) {
  throw new Error(
    'O cliente do Prisma foi gerado sem o engine do Windows — o pacote não funcionaria no destino.\n' +
      `Esperado: ${engineDoWindows}`,
  );
}

// ----------------------------------------------------------------- painel
passo('Montando o painel do pacote');
const destinoPainel = join(SISTEMA, 'painel');
mkdirSync(destinoPainel, { recursive: true });
writeFileSync(
  join(destinoPainel, 'package.json'),
  packageJsonDeProducao(join(RAIZ, 'apps/web/package.json'), { scripts: { start: 'next start' } }),
);
rodar('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: destinoPainel });

cpSync(join(RAIZ, 'apps/web/.next'), join(destinoPainel, '.next'), {
  recursive: true,
  // O cache do webpack é enorme e serve só para recompilar — não para servir.
  filter: (caminho) => !caminho.includes(`${'.next'}\\cache`) && !caminho.includes('.next/cache'),
});
if (existsSync(join(RAIZ, 'apps/web/public'))) {
  cpSync(join(RAIZ, 'apps/web/public'), join(destinoPainel, 'public'), { recursive: true });
}
cpSync(join(RAIZ, 'apps/web/next.config.js'), join(destinoPainel, 'next.config.js'));

// ------------------------------------------------------------ ferramentas
passo('Incluindo o Prisma CLI (aplicar migrations no destino)');
// O CLI é dependência de desenvolvimento e não entra no node_modules de
// produção — mas o computador de teste precisa dele UMA vez, para criar as
// tabelas. Vai numa pasta à parte para deixar claro que não é runtime.
const ferramentas = join(SISTEMA, 'ferramentas');
mkdirSync(ferramentas, { recursive: true });
writeFileSync(
  join(ferramentas, 'package.json'),
  JSON.stringify({ name: 'comercion-ferramentas', private: true, dependencies: { prisma: '5.22.0' } }, null, 2),
);
rodar('npm', ['install', '--no-audit', '--no-fund'], { cwd: ferramentas });

// --------------------------------------------------- dados de exemplo
passo('Compilando os dados de exemplo (loja demo)');
// O seed é TypeScript e o destino não tem compilador. Vira JS aqui.
// Dentro da API de proposito: o Node resolve `require` pela pasta DO ARQUIVO,
// nao pelo diretorio de trabalho. Fora daqui, o seed nao acha o @prisma/client
// nem o bcrypt, por mais que o script rode a partir da API — medido.
const destinoSeed = join(destinoApi, 'exemplo');
mkdirSync(destinoSeed, { recursive: true });
// Roda a partir de apps/api: é lá que o typescript está instalado, e de
// outro diretório o npx tentaria baixá-lo da internet.
rodar(
  'npx',
  [
    'tsc',
    'prisma/seed.ts',
    '--outDir', `"${destinoSeed}"`,
    '--module', 'commonjs',
    '--target', 'es2021',
    '--esModuleInterop',
    '--skipLibCheck',
    '--types', 'node',
  ],
  { cwd: join(RAIZ, 'apps/api') },
);

// ------------------------------------------------------- scripts do usuário
passo('Escrevendo os scripts de instalação e uso');
const modelos = join(RAIZ, 'scripts/pacote-windows');
for (const arquivo of ['INSTALAR.bat', 'INICIAR.bat', 'PARAR.bat', 'DADOS-DE-EXEMPLO.bat', 'LEIAME.txt']) {
  cpSync(join(modelos, arquivo), join(SAIDA, arquivo));
}
// Os .ps1 vão com BOM de propósito. O Windows PowerShell 5.1 — o que vem no
// Windows — lê script sem BOM como ANSI, e todo acento vira lixo na tela:
// "instalação" apareceu como "instalaÃ§Ã£o" no primeiro teste. Com BOM ele
// reconhece UTF-8 e o texto sai certo.
const BOM = '﻿';
const destinoScripts = join(SAIDA, 'sistema/scripts');
mkdirSync(destinoScripts, { recursive: true });
for (const script of readdirSync(join(modelos, 'ferramentas'))) {
  writeFileSync(join(destinoScripts, script), BOM + readFileSync(join(modelos, 'ferramentas', script), 'utf8'));
}

// ------------------------------------------------------------- conferência
passo('Conferindo o pacote');
// Um pacote incompleto só dá erro no computador de teste, longe de quem pode
// consertar. Cada item aqui já faltou em alguma montagem.
const OBRIGATORIOS = [
  ['API compilada', 'sistema/api/dist/src/main.js'],
  ['engine do Prisma para Windows', 'sistema/api/node_modules/.prisma/client/query_engine-windows.dll.node'],
  // bcryptjs, e nao mais o bcrypt nativo: e JavaScript puro, entao o pacote
  // deixou de depender de um binario compilado para a versao exata de Node da
  // maquina de destino — que era a parte mais fragil de levar isto para outro
  // computador.
  ['bcryptjs', 'sistema/api/node_modules/bcryptjs/index.js'],
  ['migrations', 'sistema/api/prisma/migrations'],
  ['painel compilado', 'sistema/painel/.next/BUILD_ID'],
  ['next no painel', 'sistema/painel/node_modules/next/dist/bin/next'],
  ['Prisma CLI', 'sistema/ferramentas/node_modules/prisma/build/index.js'],
  ['engine de schema (migrations)', 'sistema/ferramentas/node_modules/@prisma/engines/schema-engine-windows.exe'],
    // O tsc preserva a estrutura: seed.ts importa de ../src, entao a raiz
  // comum vira apps/api e a saida fica em exemplo/prisma/seed.js.
  ['dados de exemplo', 'sistema/api/exemplo/prisma/seed.js'],
  ['instalador', 'INSTALAR.bat'],
];
const faltando = OBRIGATORIOS.filter(([, caminho]) => !existsSync(join(SAIDA, caminho)));
if (faltando.length > 0) {
  throw new Error(`Pacote incompleto:\n${faltando.map(([o, c]) => `  - ${o} (${c})`).join('\n')}`);
}
for (const [oque] of OBRIGATORIOS) console.log(`  ok  ${oque}`);

console.log(`\nPacote montado em ${SAIDA}`);
console.log('Compacte esta pasta e leve para o computador de teste.');
