import { montarOrdenacao, type OrdenacaoQueryDto } from './pagination.dto';

const MAPA = { nome: 'name', preco: 'price', cliente: 'customer.name' };
const PADRAO = { name: 'asc' as const };

describe('montarOrdenacao', () => {
  it('traduz a coluna da tela para o campo do banco', () => {
    expect(montarOrdenacao({ ordenarPor: 'preco', direcao: 'desc' } as OrdenacaoQueryDto, MAPA, PADRAO)).toEqual({
      price: 'desc',
    });
  });

  it('ordena por campo de relação quando o caminho tem ponto', () => {
    expect(montarOrdenacao({ ordenarPor: 'cliente', direcao: 'asc' } as OrdenacaoQueryDto, MAPA, PADRAO)).toEqual({
      customer: { name: 'asc' },
    });
  });

  it('usa o padrão da listagem quando ninguém pediu ordem', () => {
    expect(montarOrdenacao({} as OrdenacaoQueryDto, MAPA, PADRAO)).toEqual(PADRAO);
  });

  /**
   * O caso que justifica a lista branca existir.
   *
   * Sem ela, `?ordenarPor=costPrice` deixaria qualquer um ordenar a lista por
   * um campo que a tela nunca mostra — e ordenar por um campo é conseguir lê-lo
   * aos poucos, comparando as posições. O nome desconhecido tem que morrer
   * aqui, antes de virar consulta.
   */
  it('ignora coluna fora da lista branca', () => {
    for (const intruso of ['costPrice', 'tenantId', 'id', 'customer.document', '__proto__']) {
      expect(montarOrdenacao({ ordenarPor: intruso } as OrdenacaoQueryDto, MAPA, PADRAO)).toEqual(PADRAO);
    }
  });

  it('só aceita asc e desc como direção', () => {
    // A validação recusa outros valores antes de chegar aqui; ainda assim o
    // helper não repassa o que recebeu — o pior caso é ordenar crescente.
    const esquisito = { ordenarPor: 'nome', direcao: 'delete' } as unknown as OrdenacaoQueryDto;
    expect(montarOrdenacao(esquisito, MAPA, PADRAO)).toEqual({ name: 'asc' });
  });
});
