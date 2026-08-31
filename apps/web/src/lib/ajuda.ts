/**
 * O que cada tela faz, e as dúvidas que ela realmente provoca.
 *
 * Ajuda de sistema costuma explicar o óbvio ("clique em Novo para criar um
 * novo") e calar sobre o que trava a pessoa de verdade. Aqui é o contrário: as
 * perguntas abaixo são as que o sistema provoca de fato — por que "Fiado" não
 * aparece na lista de pagamentos, por que não existe botão de criar ordem de
 * serviço, por que a diferença do caixa só surge depois de confirmar.
 *
 * Cada resposta descreve o comportamento que o código tem hoje. Se uma regra
 * mudar e este texto ficar para trás, a ajuda passa a mentir — e ajuda que
 * mente é pior que ausência de ajuda, porque a pessoa para de procurar.
 *
 * O `href` casa com o item do menu (GROUPS, no Sidebar). É assim que a ajuda
 * herda de graça o filtro por plano e por papel: quem não tem o módulo não lê
 * sobre a função, e não fica sabendo de tela que não pode abrir.
 */
export interface Duvida {
  pergunta: string;
  resposta: string;
}

export interface Topico {
  /** Mesmo endereço do menu — é a chave que liga a ajuda à navegação. */
  href: string;
  /** Uma frase: para que a tela serve. */
  paraQue: string;
  duvidas: Duvida[];
}

export const TOPICOS: Topico[] = [
  {
    href: '/dashboard',
    paraQue: 'O resumo do dia e do mês: quanto vendeu, quantas vendas, ticket médio e o quanto falta para a meta.',
    duvidas: [
      {
        pergunta: '"Vendas hoje" conta o dinheiro que entrou na gaveta?',
        resposta:
          'Não — conta o valor das vendas. Uma venda de R$ 320 paga com R$ 100 em dinheiro e R$ 220 fiado soma R$ 320 aqui. Os R$ 220 aparecem no Financeiro como conta a receber, e no Caixa entram só os R$ 100.',
      },
      {
        pergunta: 'De onde vem a meta do mês?',
        resposta: 'De Relatórios. É lá que você define o valor; o painel apenas mostra o progresso.',
      },
    ],
  },
  {
    href: '/pos',
    paraQue: 'Vender no balcão: bipa a peça, escolhe como o cliente vai pagar e finaliza.',
    duvidas: [
      {
        pergunta: 'Não encontro "Fiado" na lista de formas de pagamento.',
        resposta:
          'Ela só aparece depois de escolher o cliente. Fiado é dívida, e o sistema precisa saber de quem cobrar depois — não dá para fiar para "cliente avulso".',
      },
      {
        pergunta: 'Quando o fiado vence?',
        resposta:
          'Pelo prazo em dias que você informar na venda. Se não informar, vale o prazo padrão do cadastro do cliente. Sem nenhum dos dois o sistema não fecha a venda fiado, porque não saberia quando cobrar.',
      },
      {
        pergunta: 'A venda foi recusada por limite de crédito.',
        resposta:
          'O cliente tem um teto de saldo em aberto no cadastro dele, e o que ele já deve mais o fiado desta venda passaria desse teto. A mensagem mostra os três valores. Receba uma parte agora, ou aumente o limite no cadastro do cliente. Limite em branco quer dizer sem teto.',
      },
      {
        pergunta: 'Preciso do caixa aberto para vender?',
        resposta:
          'Não. Mas a venda em dinheiro só entra na conferência do fim do dia se houver um caixa aberto no seu nome — senão você fecha o dia com a gaveta cheia e o sistema dizendo que só tinha o troco.',
      },
    ],
  },
  {
    href: '/cash',
    paraQue: 'A gaveta do dia: o troco inicial, o que entrou em dinheiro e a conferência no fechamento.',
    duvidas: [
      {
        pergunta: 'Como o valor esperado é calculado?',
        resposta: 'Troco inicial, mais as vendas em dinheiro, mais os suprimentos, menos as sangrias.',
      },
      {
        pergunta: 'Por que cartão e Pix não entram no valor esperado?',
        resposta: 'Porque esse dinheiro não está na gaveta. Eles aparecem na tela só para conferência.',
      },
      {
        pergunta: 'Digitei o valor contado e a diferença não apareceu.',
        resposta:
          'Ela aparece depois que você confirma, de propósito. Se o sistema mostrasse antes, seria fácil ajustar a contagem até bater — e a conferência não valeria nada.',
      },
      {
        pergunta: 'Fechei o caixa e preciso vender.',
        resposta: 'Abra outro. A sessão fechada não aceita mais vendas.',
      },
    ],
  },
  {
    href: '/sales',
    paraQue: 'Todas as vendas confirmadas, com filtro por situação, e a devolução.',
    duvidas: [
      {
        pergunta: 'Registrei uma devolução. Preciso acertar o estoque na mão?',
        resposta: 'Não. A devolução ajusta o estoque e o financeiro junto.',
      },
      {
        pergunta: 'As vendas do PDV aparecem aqui?',
        resposta: 'Sim, na mesma lista — PDV e balcão não são listas separadas.',
      },
    ],
  },
  {
    href: '/quotes',
    paraQue: 'Orçar antes de executar, e deixar o cliente aprovar.',
    duvidas: [
      {
        pergunta: 'Como o cliente aprova?',
        resposta:
          'Cada orçamento tem um link próprio para você mandar por WhatsApp ou e-mail. O cliente abre, vê os itens e aprova ou recusa — sem login e sem senha.',
      },
      {
        pergunta: 'O cliente aprovou por telefone.',
        resposta: 'Use "Aprovar manualmente". O efeito é exatamente o mesmo do link.',
      },
      {
        pergunta: 'O que acontece quando o orçamento é aprovado?',
        resposta: 'A ordem de serviço abre na hora, já com os itens e o veículo do orçamento.',
      },
    ],
  },
  {
    href: '/service-orders',
    paraQue: 'A bancada: o que está para fazer, o que está em execução e o que já saiu.',
    duvidas: [
      {
        pergunta: 'Não encontro o botão de criar uma ordem de serviço.',
        resposta:
          'Ele não existe, e é de propósito: toda ordem nasce de um orçamento aprovado. Faça o orçamento em Orçamentos, aprove pelo link do cliente ou manualmente, e ela aparece aqui na bancada.',
      },
      {
        pergunta: 'O que acontece ao concluir?',
        resposta:
          'A ordem vira venda e gera a conta a receber. O vencimento sai do prazo padrão do cadastro do cliente; sem prazo cadastrado, vence no próprio dia.',
      },
      {
        pergunta: 'Quando uma ordem conta como atrasada?',
        resposta:
          'Quando tem dia agendado no passado e ainda não saiu da bancada. Uma ordem marcada para hoje às 14h não está atrasada às 9h — a conta é por dia, não por hora.',
      },
    ],
  },
  {
    href: '/products',
    paraQue: 'O catálogo e o saldo de cada peça.',
    duvidas: [
      {
        pergunta: 'Como o sistema sabe que uma peça está acabando?',
        resposta:
          'Pelo estoque mínimo do cadastro dela. Quando a soma em todos os depósitos fica igual ou abaixo desse número, a peça entra no aviso de estoque baixo e pode disparar automação.',
      },
      {
        pergunta: 'O que a busca aceita?',
        resposta: 'Nome, SKU ou código de barras — dá para bipar direto no campo.',
      },
    ],
  },
  {
    href: '/categories',
    paraQue: 'Como as peças ficam organizadas.',
    duvidas: [
      {
        pergunta: 'Sou obrigado a categorizar tudo?',
        resposta: 'Não. O campo é opcional e a peça funciona sem categoria.',
      },
    ],
  },
  {
    href: '/stock-counts',
    paraQue: 'Conferir o que está na prateleira contra o que o sistema diz.',
    duvidas: [
      {
        pergunta: 'O que acontece quando finalizo a contagem?',
        resposta:
          'Onde o contado for diferente do esperado, o sistema acerta o saldo para o que você contou e registra o motivo no histórico da peça — para você entender a diferença depois.',
      },
      {
        pergunta: 'Não contei todas as peças da lista.',
        resposta: 'As que ficaram sem contagem não são tocadas. O saldo delas continua exatamente como estava.',
      },
    ],
  },
  {
    href: '/suppliers',
    paraQue: 'De quem você compra.',
    duvidas: [
      {
        pergunta: 'Para que vincular um fornecedor à peça?',
        resposta: 'Para saber de quem comprar quando o estoque baixar, sem ter que procurar.',
      },
    ],
  },
  {
    href: '/customers',
    paraQue: 'Quem compra na sua loja: telefone, veículos e o histórico de quem volta.',
    duvidas: [
      {
        pergunta: 'Para que serve o limite de crédito?',
        resposta:
          'É o teto do saldo em aberto do cliente. A venda fiado que passar desse teto é recusada no balcão, com os números na tela. Em branco quer dizer sem teto.',
      },
      {
        pergunta: 'E o prazo padrão de pagamento?',
        resposta:
          'Em quantos dias o fiado desse cliente vence, quando você não informar outro prazo na hora da venda.',
      },
    ],
  },
  {
    href: '/whatsapp',
    paraQue: 'As conversas com os clientes, num lugar só.',
    duvidas: [
      {
        pergunta: 'O robô responde tudo sozinho?',
        resposta:
          'Ele responde as perguntas frequentes. Quando não sabe responder, a conversa fica "aguardando atendente" até alguém da loja assumir.',
      },
    ],
  },
  {
    href: '/cobrancas',
    paraQue: 'As mensagens de cobrança que as automações escreveram, esperando a sua autorização.',
    duvidas: [
      {
        pergunta: 'Isso envia sozinho para o cliente?',
        resposta: 'Não. O sistema escreve; nada sai daqui sem você autorizar.',
      },
      {
        pergunta: 'A lista está vazia.',
        resposta: 'É bom sinal: nenhuma automação de cobrança encontrou conta vencendo ou vencida.',
      },
    ],
  },
  {
    href: '/whatsapp/conexao',
    paraQue: 'Ligar o WhatsApp da loja ao sistema, lendo um QR Code como se fosse mais um aparelho.',
    duvidas: [
      {
        pergunta: 'Tem risco para o meu número?',
        resposta:
          'Tem, e vale saber antes: esta conexão usa o WhatsApp comum por um caminho que não é oficial, e o WhatsApp pode bloquear o número — temporária ou permanentemente. Se o WhatsApp é o canal de vendas da loja, pese isso. O caminho oficial (WhatsApp Business API) não tem esse risco, mas cobra por conversa e exige verificação da empresa junto à Meta.',
      },
      {
        pergunta: 'Depois de conectar, o sistema passa a responder meus clientes?',
        resposta:
          'A conexão serve para enviar as cobranças que você autorizar. As mensagens que chegam continuam vindo pelos canais de sempre.',
      },
    ],
  },
  {
    href: '/pipeline',
    paraQue: 'As oportunidades em aberto, organizadas por etapa.',
    duvidas: [
      {
        pergunta: 'Aparece "nenhuma etapa de funil configurada".',
        resposta: 'As etapas vêm da configuração da loja. Sem elas não há colunas para arrastar as oportunidades.',
      },
    ],
  },
  {
    href: '/tasks',
    paraQue: 'O que precisa ser feito, com prazo e responsável.',
    duvidas: [
      {
        pergunta: 'Criei uma tarefa sem prazo e não a encontro.',
        resposta: 'Ela fica no grupo "Sem prazo / mais distantes", no fim da lista.',
      },
    ],
  },
  {
    href: '/finance',
    paraQue: 'Contas a receber e contas a pagar.',
    duvidas: [
      {
        pergunta: 'Uma conta que vence hoje aparece como vencida?',
        resposta:
          'Não. Vencer hoje não é estar vencida — o cliente tem o dia inteiro para pagar. Ela fica como "Pendente", com o aviso "vence hoje" ao lado.',
      },
      {
        pergunta: 'De onde vêm os lançamentos?',
        resposta:
          'Das vendas e das ordens de serviço, automaticamente, e do que você lançar à mão em "Novo lançamento".',
      },
    ],
  },
  {
    href: '/reports',
    paraQue: 'Comparar períodos, acompanhar a meta e exportar.',
    duvidas: [
      {
        pergunta: 'Onde defino a meta do mês?',
        resposta: 'Aqui. O painel usa esse valor para mostrar o progresso.',
      },
    ],
  },
  {
    href: '/automations',
    paraQue: 'Regras que observam o negócio e agem sozinhas.',
    duvidas: [
      {
        pergunta: 'A automação manda mensagem para o cliente sem eu ver?',
        resposta:
          'Depende da ação escolhida. "Enviar WhatsApp" manda direto. "Preparar WhatsApp (pede autorização)" escreve a mensagem e deixa em "Cobranças para enviar", à sua espera.',
      },
      {
        pergunta: 'O que cada gatilho faz?',
        resposta:
          'A própria tela descreve cada um enquanto você monta a regra, dizendo o que ele observa e quando dispara.',
      },
    ],
  },
  {
    href: '/coupons',
    paraQue: 'Descontos que valem no PDV e nas vendas do balcão.',
    duvidas: [
      {
        pergunta: 'Desativei um cupom. E as vendas que já usaram ele?',
        resposta: 'Não mudam. O cupom só para de ser aceito dali para a frente.',
      },
    ],
  },
  {
    href: '/users',
    paraQue: 'Quem tem acesso ao sistema e o que cada um enxerga.',
    duvidas: [
      {
        pergunta: 'Quais são os papéis?',
        resposta:
          'Administrador, Vendas, Financeiro, Estoque e Suporte. O papel decide o que a pessoa vê no menu — e o sistema também barra por trás, não só esconde.',
      },
    ],
  },
  {
    href: '/settings',
    paraQue:
      'Como sua empresa aparece para o cliente: no cupom impresso, na ordem de serviço e na página de aprovação de orçamento.',
    duvidas: [],
  },
  {
    href: '/billing',
    paraQue: 'Seu plano, os módulos que ele libera e as faturas.',
    duvidas: [
      {
        pergunta: 'Sumiu uma tela do meu menu.',
        resposta: 'O menu mostra só o que o seu plano libera. Se estiver faltando alguma, confira o plano aqui.',
      },
    ],
  },
];

/** Índice por endereço, para casar com o item do menu sem varrer a lista. */
export const TOPICO_POR_HREF = new Map(TOPICOS.map((t) => [t.href, t]));

/** `/whatsapp/conexao` vira `ajuda-whatsapp-conexao`, para dar link direto. */
export function ancoraDoTopico(href: string): string {
  return `ajuda-${href.replace(/^\//, '').replace(/\//g, '-')}`;
}

/**
 * O endereço da ajuda para a tela em que a pessoa está.
 *
 * Existe para o "?" da barra do topo levar ao verbete certo em vez de ao
 * índice: a dúvida nasce na tela, e quem está travado no PDV não deveria ter
 * de procurar "PDV" numa lista de vinte e duas telas.
 *
 * Casa pelo prefixo mais longo, igual à trilha do menu — `/products/abc-123` é
 * a tela de Produtos, e quem abriu a ficha de uma peça continua com a ajuda de
 * Produtos à mão. Sem correspondência, cai no índice, que é melhor que nada.
 */
export function ajudaDaRota(pathname: string): string {
  let melhor: string | null = null;

  for (const topico of TOPICOS) {
    if (pathname !== topico.href && !pathname.startsWith(`${topico.href}/`)) continue;
    if (melhor && topico.href.length <= melhor.length) continue;
    melhor = topico.href;
  }

  return melhor ? `/ajuda#${ancoraDoTopico(melhor)}` : '/ajuda';
}

/**
 * Filtra por texto, olhando o resumo e também as perguntas e respostas.
 *
 * Buscar só no título encontraria "Caixa" e não encontraria "diferença", que é
 * a palavra que a pessoa realmente digita quando o fechamento não bate.
 */
export function combina(topico: Topico, termo: string): boolean {
  const busca = termo.trim().toLowerCase();
  if (!busca) return true;

  return [topico.paraQue, ...topico.duvidas.flatMap((d) => [d.pergunta, d.resposta])]
    .join(' ')
    .toLowerCase()
    .includes(busca);
}
