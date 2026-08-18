/**
 * Quantos proxies na frente da API merecem confiança.
 *
 * O que está em jogo: o limitador de requisições usa `req.ip` como chave. Com
 * o padrão do Express (`trust proxy` desligado), `req.ip` é o endereço de quem
 * abriu a conexão TCP — atrás do Caddy, o PRÓPRIO CADDY, para todas as lojas e
 * todos os usuários. O teto de 100 req/min deixa de ser por cliente e vira teto
 * da plataforma inteira: meia dúzia de pessoas trabalhando ao mesmo tempo já
 * começa a tomar 429, e qualquer um derruba todo mundo com 100 requisições.
 *
 * Medido antes da correção: esgotado o teto com um `X-Forwarded-For`, a
 * requisição seguinte com um IP completamente diferente já vinha 429.
 *
 * Por que não ligar sempre: confiar no `X-Forwarded-For` de quem fala direto
 * com a API é o defeito oposto — aí qualquer um forja o próprio IP e passa por
 * cima do limite de login trocando o cabeçalho a cada tentativa. Por isso o
 * padrão é NÃO confiar, e quem põe proxy na frente declara quantos saltos são
 * dele (`TRUST_PROXY=1` no compose de produção, onde o Caddy é a única entrada).
 *
 * O número importa: `trust proxy: 1` faz o Express pegar o ÚLTIMO endereço da
 * cadeia, que é o que o proxy imediato escreveu e o cliente não controla.
 */
export function confiarNoProxy(valor: string | undefined): number | false {
  if (valor === undefined || valor === '') return false;

  const normalizado = valor.trim().toLowerCase();
  if (normalizado === 'false' || normalizado === '0' || normalizado === 'no') return false;
  // `true` sem número é o caso comum de quem só quer "tem um proxy na frente".
  if (normalizado === 'true' || normalizado === 'yes') return 1;

  const saltos = Number(normalizado);
  // Valor sem sentido (texto, negativo, fracionado) não pode virar "confia em
  // todo mundo" por acidente: cai no padrão seguro.
  return Number.isInteger(saltos) && saltos > 0 ? saltos : false;
}
