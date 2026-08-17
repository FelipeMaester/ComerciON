# Colocar o ComerciON no ar

Do servidor zerado até o sistema acessível, num servidor único (VPS).
Testado de ponta a ponta com esta mesma configuração — ver "O que já foi
verificado" no fim.

## O que você precisa antes de começar

- **Um servidor** com Docker. Qualquer VPS de 2 vCPU / 4 GB dá conta de uma
  loja com folga (Hetzner, DigitalOcean, Contabo, Vultr, Magalu Cloud).
  Com 2 GB funciona, mas o build das imagens fica apertado — nesse caso
  construa as imagens em outra máquina e envie prontas.
- **Um domínio** e acesso ao painel de DNS.
- **Três subdomínios** apontando para o IP do servidor. Podem ser o que você
  quiser; o exemplo usa:

  | Subdomínio | Serve | Quem acessa |
  |---|---|---|
  | `painel.seudominio.com.br` | painel administrativo | sua equipe |
  | `api.seudominio.com.br` | API | o painel e as páginas públicas |
  | `monitor.seudominio.com.br` | painel de monitoramento | só você |

> **Os subdomínios precisam ser do mesmo domínio.** A sessão vai em cookie, e
> o navegador só o envia entre endereços que ele considera o mesmo site —
> `painel.suaempresa.com.br` e `api.suaempresa.com.br` são; `painel.umsite.com`
> e `api.outrosite.com` não são, e aí ninguém consegue entrar.

> **O DNS precisa estar propagado ANTES de subir.** O certificado é validado
> pela Let's Encrypt por HTTP na porta 80: se o domínio ainda não resolve
> para este servidor, a emissão falha e o site fica inacessível. Confira com
> `dig +short painel.seudominio.com.br` — tem que devolver o IP do servidor.

## 1. Preparar o servidor

```bash
# Docker (script oficial)
curl -fsSL https://get.docker.com | sh

# Firewall: só SSH e web. O Postgres NÃO é exposto pelo compose de produção,
# mas fechar a porta é a segunda camada.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Trazer o código

```bash
git clone <url-do-repositorio> comercion
cd comercion
```

## 3. Gerar os segredos

```bash
./scripts/gerar-env-producao.sh \
  painel.seudominio.com.br \
  api.seudominio.com.br \
  voce@seudominio.com.br
```

Cria o `.env` com segredos aleatórios e permissão 600. **Guarde uma cópia em
lugar seguro** (gerenciador de senhas serve): perder os segredos de JWT
desloga todo mundo; perder a senha do Postgres sem ter o volume é perder o
banco.

A API se recusa a subir em produção com os valores de exemplo, com segredo
curto demais ou com dois segredos de JWT iguais. Se aparecer
`Recusando subir em produção com segredos inseguros`, é isso.

## 4. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

A primeira vez demora — são duas imagens sendo construídas. A ordem é:
Postgres sobe → `migrate` aplica as migrations e sai → API e painel sobem →
Caddy pede o certificado.

```bash
# Acompanhar
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy   # emissão do certificado
```

Tudo deve ficar `Up ... (healthy)`, menos `migrate`, que sai com `Exited (0)`
— ele é de execução única, por isso não roda dentro de cada réplica da API.

## 5. Criar a primeira loja

Acesse `https://painel.seudominio.com.br/register` e cadastre. O primeiro
cadastro cria a empresa, o usuário administrador, o depósito padrão e as
etapas do funil.

Anote o **identificador da empresa** (o "slug"): ele é pedido no login,
enquanto você não ligar o endereço próprio por loja — ver "Uma loja por
subdomínio" abaixo, que faz a tela deixar de perguntar.

## Depois que está no ar

### Atualizar

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

As migrations rodam sozinhas antes da API subir. Se uma migration falhar, a
API **não** sobe com o schema errado — o compose interrompe ali.

> Trocar de domínio exige rebuild, não só reiniciar: as URLs `NEXT_PUBLIC_*`
> são embutidas no bundle do navegador em tempo de build.

### Backup

O serviço `backup` roda sozinho: dump diário em `./backups`, verificado lendo
o arquivo inteiro, com retenção de 14 dias preservando sempre os 3 mais
recentes.

**Um dump ao lado do banco protege contra apagar dados por engano, e contra
mais nada** — não contra o disco morrer, o provedor sumir com a máquina ou
ransomware, que é justamente quando você precisa dele. Ligue a cópia externa:

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config          # crie um destino; Backblaze B2 é o mais barato para isto
mkdir -p rclone && cp ~/.config/rclone/rclone.conf rclone/
```

Depois preencha no `.env`:

```bash
BACKUP_REMOTE=b2:comercion-backups
```

O serviço de backup instala o rclone sozinho quando `BACKUP_REMOTE` está
preenchido, envia o dump e **confere que o arquivo chegou** antes de dar por
feito. Se o envio falhar, o dump local é preservado e o erro aparece no log
com todas as letras — nunca um "OK" que esconde a ausência da cópia externa.

Com `BACKUP_REMOTE` vazio, cada backup registra um aviso de que existe só
naquela máquina.

A pasta `rclone/` está no `.gitignore`: ela guarda as credenciais do seu
armazenamento, e vazá-las é entregar o backup inteiro.

Ensaio de restauração, num banco descartável e sem tocar em produção:

```bash
./scripts/restore-db.sh --into ensaio --drop
```

**Rode isso pelo menos uma vez por mês.** Um backup que nunca foi restaurado
não é um backup, é um arquivo.

### Uma loja por subdomínio

Sem isto, cada loja precisa saber e digitar o próprio identificador na tela
de login — e errar ali devolve "credenciais inválidas", que manda a pessoa
procurar o problema na senha.

Para ligar:

1. Crie um registro DNS **curinga**: `*.painel.seudominio.com.br` → IP deste
   servidor. É o único passo manual; o certificado o Caddy resolve sozinho.
2. No `.env`:

```bash
TENANT_BASE_DOMAIN=painel.seudominio.com.br
```

3. Rebuild, porque o painel embute esse valor no bundle:

```bash
docker compose -f docker-compose.prod.yml up -d --build web
```

A partir daí, `oficina-do-ze.painel.seudominio.com.br` abre o painel já com a
loja identificada. O endereço sem loja (`painel.seudominio.com.br`) continua
pedindo o identificador — é a porta de entrada de quem ainda não tem o
próprio endereço.

O certificado de cada loja é emitido na PRIMEIRA visita, e só depois de a API
confirmar que aquele endereço pertence a uma loja existente. Sem essa
confirmação, qualquer um apontaria mil subdomínios para o servidor e
esgotaria a cota semanal da Let's Encrypt — e aí nem as lojas reais
renovariam.

**Não aponte `TENANT_BASE_DOMAIN` para o domínio raiz.** Com
`seudominio.com.br`, uma loja chamada "api" viraria `api.seudominio.com.br` e
brigaria com o endereço da própria API. Use um nível a mais, como no exemplo.

### Cobrar as lojas (assinatura)

Sem configurar nada, `BILLING_PROVIDER=stub`: o fluxo de assinatura funciona
inteiro na tela e **nenhuma cobrança é emitida** — o simulado aprova tudo na
hora. Para cobrar de verdade, via Asaas:

1. Crie a conta em [asaas.com](https://www.asaas.com) e pegue a chave de API.
   São duas e elas não se misturam: a de sandbox (`$aact_hmlg_…`) só funciona
   contra `api-sandbox.asaas.com`, a de produção (`$aact_prod_…`) só contra
   `api.asaas.com`.
2. No painel do Asaas, cadastre um webhook apontando para
   `https://api.SEUDOMINIO/api/billing/webhook/asaas` e defina ali um token.
3. No `.env`:

```bash
BILLING_PROVIDER=asaas
ASAAS_API_KEY=sua-chave
ASAAS_ENV=sandbox
ASAAS_WEBHOOK_TOKEN=o-mesmo-token-do-passo-2
```

**Sem o webhook o sistema emite a cobrança e nunca fica sabendo que foi paga**
— a fatura fica pendente para sempre e a assinatura acaba em atraso. É a parte
que mais se esquece, e a que faz o resto parecer quebrado.

Boleto e PIX nascem pendentes: a loja recebe acesso na hora e o link de
pagamento aparece na tela de Assinatura. Quem não pagar até o vencimento cai
em atraso quando o Asaas avisa (`PAYMENT_OVERDUE`).

Cada loja precisa ter **CNPJ cadastrado** — o Asaas recusa cobrança sem
CPF/CNPJ do pagador.

Deixe `ASAAS_ENV=sandbox` até validar o ciclo inteiro. Em produção as cobranças
são reais e chegam de verdade para quem estiver cadastrado.

### Monitoramento

São **duas camadas**, e você precisa das duas. A de dentro já sobe junto; a
de fora leva cinco minutos e é a única que funciona quando o servidor morre.

#### Camada de dentro (já instalada)

O Uptime Kuma sobe com a pilha, em `https://monitor.seudominio.com.br`.

**Faça isto logo depois do primeiro deploy:** ele pede para criar a conta de
administrador no primeiro acesso, e até lá o painel fica aberto para quem
chegar primeiro.

Depois crie dois monitores, ambos do tipo HTTP(s), a cada 60 segundos:

| Nome | URL | O que pega |
|---|---|---|
| API | `https://api.seudominio.com.br/api/health` | API fora **ou banco inacessível** |
| Painel | `https://painel.seudominio.com.br/login` | painel fora |

Use as URLs públicas, não os nomes internos (`http://api:3001`): assim o
monitor também testa o Caddy e o certificado, não só a aplicação.

Em **Settings → Notifications**, configure ao menos um canal. Telegram é o
mais simples e não custa nada; e-mail funciona se você já configurou SMTP.

O `/api/health` devolve **503** quando o banco está inacessível, com o motivo
no corpo:

```json
{"status":"degraded","checks":{"database":{"ok":false,"error":"sem resposta em 3000ms"}}}
```

> Existe também `/api/health/live`, que só diz se o processo respondeu, sem
> tocar no banco. **Não aponte o monitor para ela** — é a que o Docker usa
> para decidir reiniciar o container, e reiniciar a API não conserta um banco
> fora do ar. Monitor observa `/api/health`.

#### Camada de fora (você precisa fazer)

O Uptime Kuma roda no mesmo servidor. Se o servidor inteiro cair — pane,
disco cheio, provedor com problema — **o monitor cai junto e ninguém é
avisado**. Essa é a falha que mais dói e a que a camada de dentro não cobre.

Escolha um serviço gratuito e aponte para `https://api.seudominio.com.br/api/health`:

- **UptimeRobot** — 50 monitores grátis, checagem a cada 5 min, avisa por
  e-mail. É o mais simples.
- **Better Stack** — 10 monitores, checagem a cada 3 min, avisa por telefone
  no plano gratuito.
- **healthchecks.io** — funciona ao contrário: o servidor avisa que está
  vivo, e o silêncio é o alerta. Melhor para vigiar o backup do que o site.

Vale a pena vigiar de fora, no mínimo:

1. `https://api.seudominio.com.br/api/health` — a aplicação inteira, já que
   ela depende do banco.
2. `https://painel.seudominio.com.br/login` — o caminho que sua equipe usa.

Configure o alerta para o **seu celular**. Um e-mail que você lê de manhã não
ajuda numa queda às 3h de um sábado.

### Ver o que está acontecendo

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs --tail 100 caddy
```

Todo erro tem um código curto que aparece na resposta e no log. Quando um
usuário reclamar, peça o código: `grep -r "a1b2c3d4"` acha a ocorrência exata.

### Restaurar depois de um desastre

```bash
docker compose -f docker-compose.prod.yml stop api web
./scripts/restore-db.sh                    # pede confirmação digitada
docker compose -f docker-compose.prod.yml start api web
```

## Problemas comuns

**O certificado não sai.** Quase sempre é DNS. Confirme com
`dig +short painel.seudominio.com.br` e veja `logs caddy`. A Let's Encrypt
limita quantos certificados o mesmo domínio pode pedir por semana — não fique
derrubando e subindo para "tentar de novo".

**A API reinicia em loop.** `logs api`. Se for `Recusando subir em produção`,
o `.env` tem segredo fraco. Se for erro de conexão, o Postgres ainda não
estava pronto (deveria se resolver sozinho pelo healthcheck).

**O painel abre mas não faz login.** É CORS: `CORS_ORIGIN` precisa bater
exatamente com o domínio do painel, com `https://` e sem barra no fim. Ele é
montado a partir de `APP_DOMAIN` no compose.

**Apaguei o volume do Caddy.** Os certificados se refazem, mas contam contra
a cota semanal da Let's Encrypt. Não apague `caddy_data` sem motivo.

## O que já foi verificado

Esta configuração foi levantada inteira, com as imagens de produção e o Caddy
na frente, e conferida:

- As migrations aplicam num banco vazio e o serviço sai com sucesso.
- Os três domínios respondem por HTTPS; HTTP redireciona com 308.
- Cadastro de empresa e login funcionam através da API em HTTPS.
- A API se recusa a subir com segredo de exemplo, apontando o script.
- O backup automático gera e verifica o dump.

Três defeitos foram encontrados justamente por rodar as imagens, e nenhum
deles aparecia em teste, type-check ou build:

1. O engine do Prisma quebrava na primeira consulta por falta de OpenSSL 3 no
   Alpine (`binaryTargets` no schema).
2. O `CMD` apontava para `dist/main.js`, mas o build gera `dist/src/main.js`.
3. O `.dockerignore` tinha `.env`, que casa só com o arquivo da raiz — o
   `apps/api/.env`, com credenciais reais, entrava na imagem.

## O que ainda não está resolvido

- **A camada externa de monitoramento depende de você.** O painel de dentro
  já sobe pronto, mas ele morre junto com o servidor — ver a seção
  Monitoramento acima.
- **Um servidor só.** Se ele cair, tudo cai. Para uma loja é aceitável; para
  vender como SaaS, não.
- **Imagens grandes** (API ~500 MB, painel ~800 MB). Funciona,
  mas torna o build no servidor lento e pesado.
- **A cobrança nunca falou com o Asaas de verdade.** O adaptador foi escrito
  contra a documentação oficial e testado com a API respondendo de mentira,
  incluindo o webhook ponta a ponta. Falta rodar uma vez no sandbox com chave
  real antes de cobrar alguém.
