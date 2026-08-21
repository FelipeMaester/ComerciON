import { PrismaClient } from '@prisma/client';

/**
 * Remove do banco de desenvolvimento as lojas criadas pelos testes.
 *
 * A suíte de ponta a ponta cria uma loja por teste — é assim de propósito, para
 * um teste nunca enxergar o dado de outro. O que faltava era a vassoura: nada
 * apagava depois, e o banco de desenvolvimento foi acumulando. Medido hoje:
 * 7.863 lojas, das quais 7.860 eram lixo de teste, e 119 MB. Com esse volume a
 * própria suíte fica lenta e passa a falhar por tempo esgotado — foi assim que
 * o problema apareceu, como falha intermitente que parecia defeito de produto.
 *
 * O corte é pela FORMA do identificador, e não por lista de prefixos: todo
 * teste monta o nome como `<prefixo>-<carimbo em base36>-<5 aleatórios>`, e
 * alguns scripts usam `<prefixo>-<epoch>`. Uma loja de verdade não se parece
 * com isso. Lista de prefixos envelheceria mal — bastaria um teste novo usar
 * outro prefixo para o lixo voltar a se acumular sem ninguém notar.
 *
 * Por segurança, roda em seco por padrão: mostra o que apagaria e não apaga.
 * Para apagar de verdade, `--apagar`.
 *
 *   pnpm --filter api limpar:testes            (mostra)
 *   pnpm --filter api limpar:testes --apagar   (apaga)
 */

/** `e2e-mt1kh7z9-fz1k3`, `plano-mt08cgc4-ujnc0`, `t-a-mswkwyyo-tqeah`. */
const FORMA_DA_SUITE = /-[0-9a-z]{7,10}-[0-9a-z]{5}$/;

/** `chk-1787076714`, `caixa-1787141932` — scripts que usam o epoch direto. */
const FORMA_DE_SCRIPT = /-\d{10}$/;

/**
 * Nunca apagar, aconteça o que acontecer.
 *
 * Segunda rede de proteção, além do formato: se um dia uma loja de verdade for
 * batizada de um jeito que se pareça com as de teste, ela ainda assim escapa.
 */
const PROTEGIDAS = new Set(['demo', 'pecas-rapidas-teste', 'radiadoresbelavista']);

function ehDeTeste(slug: string): boolean {
  if (PROTEGIDAS.has(slug)) return false;
  return FORMA_DA_SUITE.test(slug) || FORMA_DE_SCRIPT.test(slug);
}

/**
 * Apaga primeiro o que impede a loja de sair.
 *
 * Cinco tabelas apontam para `User`, `Customer` e `Vehicle` sem `onDelete`, o
 * que no Prisma significa RESTRICT: enquanto elas existirem, apagar a loja
 * falha com violação de chave estrangeira. E o RESTRICT está certo onde está —
 * é ele que impede apagar um operador e levar junto a movimentação de caixa que
 * ele lançou. O caminho inverso, de apagar a LOJA inteira, remove na ordem.
 *
 * A mesma ordem existe no SuperAdminService, que atende o pedido de exclusão de
 * uma loja de verdade. Repetida aqui de propósito: este script roda sozinho,
 * por linha de comando, sem levantar a aplicação — importar o serviço traria o
 * Nest inteiro junto para apagar linha de teste.
 */
async function limparDependentes(prisma: PrismaClient, tenantIds: string[]) {
  const where = { tenantId: { in: tenantIds } };
  // A ordem importa: movimentação antes da sessão de caixa, ordem de serviço
  // antes do orçamento que a originou.
  await prisma.cashMovement.deleteMany({ where });
  await prisma.cashSession.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.serviceOrder.deleteMany({ where });
  await prisma.quote.deleteMany({ where });
}

async function main() {
  const apagar = process.argv.includes('--apagar');
  const prisma = new PrismaClient();

  try {
    const todas = await prisma.tenant.findMany({ select: { id: true, slug: true } });
    const alvo = todas.filter((t) => ehDeTeste(t.slug));
    const mantidas = todas.filter((t) => !ehDeTeste(t.slug));

    console.log(`lojas no banco: ${todas.length}`);
    console.log(`de teste (serão apagadas): ${alvo.length}`);
    console.log(`mantidas: ${mantidas.map((t) => t.slug).join(', ') || '(nenhuma)'}`);

    if (alvo.length === 0) return;

    if (!apagar) {
      console.log('\nnada foi apagado. rode com --apagar para valer.');
      return;
    }

    // Em blocos: um `deleteMany` com oito mil ids monta uma consulta gigante, e
    // o cascade de cada loja derruba dezenas de tabelas junto.
    const BLOCO = 200;
    let removidas = 0;
    for (let i = 0; i < alvo.length; i += BLOCO) {
      const ids = alvo.slice(i, i + BLOCO).map((t) => t.id);
      await limparDependentes(prisma, ids);
      const { count } = await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
      removidas += count;
      process.stdout.write(`\rapagadas ${removidas}/${alvo.length}`);
    }
    console.log(`\npronto: ${removidas} loja(s) de teste removida(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
