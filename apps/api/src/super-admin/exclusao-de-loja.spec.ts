import { Prisma } from '@prisma/client';
import { ORDEM_DE_EXCLUSAO } from './super-admin.service';

/**
 * O teste que impede a exclusão de loja de quebrar em produção.
 *
 * Apagar uma loja funciona por cascade: quase tudo desce sozinho a partir de
 * Tenant. Quase. Algumas tabelas apontam para User, Customer ou Vehicle sem
 * `onDelete`, o que no Prisma significa RESTRICT — e enquanto elas existirem, a
 * loja não sai. Por isso o serviço remove essas primeiro, numa lista escrita à
 * mão.
 *
 * Lista escrita à mão envelhece mal. Uma tabela nova com a mesma restrição, e a
 * exclusão volta a falhar com violação de chave estrangeira — sem aviso, sem
 * teste vermelho, e só no dia em que uma loja de verdade pedir para sair. Que é
 * o pior dia possível para descobrir.
 *
 * Aqui o schema de verdade (DMMF, o mesmo que o Prisma usa) é lido e comparado
 * com a lista. Quem faltar reprova, com o nome da tabela na mensagem.
 */
describe('exclusão de loja — nenhuma tabela bloqueadora fica de fora', () => {
  const modelos = Prisma.dmmf.datamodel.models;
  const porNome = new Map(modelos.map((m) => [m.name, m]));

  /**
   * O que some sozinho quando a loja some.
   *
   * Parte de Tenant e segue as relações marcadas com Cascade, de nível em
   * nível: User cai porque aponta para Tenant com Cascade, Sale idem, e assim
   * por diante até não haver mais nada novo.
   */
  const apagadosPorCascata = (() => {
    const dentro = new Set<string>(['Tenant']);
    let mudou = true;

    while (mudou) {
      mudou = false;
      for (const modelo of modelos) {
        if (dentro.has(modelo.name)) continue;
        const desce = modelo.fields.some(
          (campo) =>
            campo.kind === 'object' &&
            campo.relationFromFields?.length &&
            campo.relationOnDelete === 'Cascade' &&
            dentro.has(campo.type),
        );
        if (desce) {
          dentro.add(modelo.name);
          mudou = true;
        }
      }
    }

    dentro.delete('Tenant');
    return dentro;
  })();

  /**
   * Quem trava a exclusão: aponta para algo que a cascata leva, e aponta sem
   * `onDelete` — que é como se escreve RESTRICT sem perceber que se escreveu.
   */
  const bloqueadores = modelos
    .filter((modelo) => modelo.fields.some((campo) => campo.name === 'tenantId'))
    .filter((modelo) =>
      modelo.fields.some(
        (campo) =>
          campo.kind === 'object' &&
          campo.relationFromFields?.length &&
          campo.isRequired &&
          campo.relationOnDelete === undefined &&
          apagadosPorCascata.has(campo.type),
      ),
    )
    .map((modelo) => modelo.name);

  it('a cascata a partir de Tenant foi mapeada (o teste não está medindo o vazio)', () => {
    // Se isto zerar, o cálculo acima quebrou e os outros dois passariam à toa.
    expect(apagadosPorCascata.size).toBeGreaterThan(10);
    expect(apagadosPorCascata.has('User')).toBe(true);
  });

  it('toda tabela que trava a exclusão está na ordem de remoção', () => {
    const esquecidas = bloqueadores.filter((nome) => !ORDEM_DE_EXCLUSAO.includes(nome as never));

    expect(esquecidas).toEqual([]);
  });

  it('a ordem não cita tabelas que não bloqueiam nada', () => {
    // Não é erro grave — apagar a mais custa uma consulta —, mas uma lista com
    // nome que não faz falta é uma lista que ninguém confia depois.
    const sobrando = ORDEM_DE_EXCLUSAO.filter((nome) => !bloqueadores.includes(nome));

    expect(sobrando).toEqual([]);
  });

  it('a ordem só cita tabelas que existem no schema', () => {
    const fantasmas = ORDEM_DE_EXCLUSAO.filter((nome) => !porNome.has(nome));

    expect(fantasmas).toEqual([]);
  });
});
