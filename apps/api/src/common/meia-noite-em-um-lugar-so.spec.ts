import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "O começo de hoje" tem de ser calculado num lugar só.
 *
 * Não é preciosismo: é o defeito mais teimoso deste sistema. Já aconteceu
 * três vezes, sempre igual — duas partes respondendo a MESMA pergunta com
 * regras próprias, e o lojista vendo dois números.
 *
 *   1. O sino dizia "3 contas vencidas" e o Financeiro mostrava outra
 *      quantidade. A correção criou `inicioDeHoje` em common/vencimento.ts,
 *      com o comentário: "Agora é uma só, e mora aqui para não voltar a
 *      divergir."
 *   2. A tela de ordens de serviço tinha a regra de "atrasada" escrita em
 *      JavaScript, com um comentário dizendo que ela PRECISAVA concordar com
 *      a do sino — o que é outra forma de dizer que um dia não vai.
 *   3. A lista de tarefas comparava com o INSTANTE agora enquanto o sino
 *      comparava com o começo do dia. Tarefa marcada para hoje às 17h
 *      aparecia atrasada às 9h da manhã num lugar e não no outro.
 *
 * As três foram achadas por acaso. Este teste é para a quarta ser achada
 * aqui.
 *
 * A asserção é sobre o CÓDIGO, e não sobre o comportamento, porque uma cópia
 * nova nasce concordando — ela só passa a divergir quando alguém ajusta um
 * lado. Nesse momento não há teste de comportamento que acuse: os dois lados
 * continuam internamente coerentes.
 */
describe('meia-noite de hoje mora num lugar só', () => {
  const raizDoSrc = join(__dirname, '..');

  /** `new Date(x.getFullYear(), x.getMonth(), x.getDate())` e `setHours(0,0,0,0)`. */
  const COPIAS_ESCRITAS_A_MAO = [
    /new Date\(\s*\w+\.getFullYear\(\),\s*\w+\.getMonth\(\),\s*\w+\.getDate\(\)\s*\)/,
    /setHours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/,
  ];

  /**
   * Onde a conta PODE aparecer escrita.
   *
   * `vencimento.ts` é a casa dela. Os testes precisam montar datas para
   * comparar, e é isso que estão fazendo.
   */
  const PERMITIDOS = ['common/vencimento.ts'];

  function arquivosDeCodigo(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) return arquivosDeCodigo(caminho);
      if (!nome.endsWith('.ts') || nome.endsWith('.spec.ts')) return [];
      return [caminho];
    });
  }

  // O nome do teste é a instrução: quando ele falha, o Jest imprime a lista de
  // arquivos e o título já diz o que fazer com ela.
  it('nenhum serviço reescreve o cálculo — use inicioDeHoje() de common/vencimento', () => {
    const infratores = arquivosDeCodigo(raizDoSrc)
      .map((caminho) => ({ caminho, conteudo: readFileSync(caminho, 'utf8') }))
      .filter(({ caminho }) => !PERMITIDOS.some((p) => caminho.replace(/\\/g, '/').endsWith(p)))
      .filter(({ conteudo }) => COPIAS_ESCRITAS_A_MAO.some((padrao) => padrao.test(conteudo)))
      .map(({ caminho }) => caminho.slice(raizDoSrc.length + 1).replace(/\\/g, '/'));

    expect(infratores).toEqual([]);
  });

  it('e a função continua onde os outros a procuram', () => {
    const vencimento = readFileSync(join(raizDoSrc, 'common/vencimento.ts'), 'utf8');
    expect(vencimento).toMatch(/export function inicioDeHoje\(/);
  });
});
