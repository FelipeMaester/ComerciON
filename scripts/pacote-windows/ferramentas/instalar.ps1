# Instala o ComerciON neste computador: banco, segredos e tabelas.
#
# Roda uma vez. Depois disso, o dia a dia é o INICIAR.bat.
#
# O que NÃO é feito aqui: baixar nada da internet. Todas as dependências já
# vieram dentro do pacote. Se este script pedir rede, é defeito.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$api = Join-Path $raiz 'sistema\api'
$prismaCli = Join-Path $raiz 'sistema\ferramentas\node_modules\prisma\build\index.js'
$arquivoEnv = Join-Path $raiz 'dados\.env'

function Titulo($texto) {
  Write-Host ''
  Write-Host "=== $texto" -ForegroundColor Cyan
}

function Parar($mensagem, $comoResolver) {
  Write-Host ''
  Write-Host "PROBLEMA: $mensagem" -ForegroundColor Red
  Write-Host ''
  Write-Host $comoResolver -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

<#
Roda um programa externo e devolve a saída, SEM deixar o stderr dele matar o
script.

O Windows PowerShell 5.1 trata qualquer linha que um .exe escreve no stderr
como erro — e com $ErrorActionPreference = 'Stop', erro encerra tudo. O
problema é que stderr não quer dizer falha: o psql escreve avisos ali. Numa
segunda instalação, "CREATE EXTENSION IF NOT EXISTS pgcrypto" emite
  NOTA: extensão "pgcrypto" já existe, ignorando
e o instalador morria no meio, com a extensão criada e nada errado.

Quem decide se deu certo é o código de saída, que é para isso que existe.
#>
function Executar {
  param([Parameter(Mandatory)][string]$Programa, [string[]]$Argumentos = @())

  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $saida = & $Programa @Argumentos 2>&1 | ForEach-Object { "$_" }
    return [pscustomobject]@{ Codigo = $LASTEXITCODE; Saida = ($saida -join [Environment]::NewLine) }
  } finally {
    $ErrorActionPreference = $anterior
  }
}

Write-Host 'ComerciON — instalação neste computador' -ForegroundColor Green

# ------------------------------------------------------------ pré-requisitos
Titulo 'Conferindo o que precisa estar instalado'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Parar 'O Node.js não está instalado.' @'
Baixe a versão LTS em https://nodejs.org/pt-br/download
Instale com as opções padrão, FECHE esta janela e rode o INSTALAR.bat de novo.
'@
}
$versaoNode = [int]((node --version) -replace 'v(\d+).*', '$1')
if ($versaoNode -lt 20) {
  Parar "O Node.js instalado é a versão $versaoNode; o sistema precisa da 20 ou mais nova." @'
Baixe a versão LTS em https://nodejs.org/pt-br/download e instale por cima.
'@
}
Write-Host "  ok  Node.js $(node --version)"

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  # O instalador do PostgreSQL não põe o psql no PATH — confirmado numa
  # instalação limpa do PostgreSQL 16. Procurar no lugar de sempre evita
  # mandar o usuário mexer em variável de ambiente.
  $candidatos = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending
  if ($candidatos) {
    $env:Path = "$(Split-Path -Parent $candidatos[0].FullName);$env:Path"
    $psql = Get-Command psql -ErrorAction SilentlyContinue
  }
}
if (-not $psql) {
  Parar 'O PostgreSQL não está instalado (ou o psql não foi encontrado).' @'
Baixe em https://www.postgresql.org/download/windows/ (instalador do EDB).
Durante a instalação ele pede uma SENHA para o usuário "postgres" — anote,
ela será pedida aqui daqui a pouco.
Depois FECHE esta janela e rode o INSTALAR.bat de novo.
'@
}
Write-Host "  ok  PostgreSQL encontrado em $($psql.Source)"

# --------------------------------------------------------------------- banco
Titulo 'Criando o banco de dados'

# PGPASSWORD já definida? Respeita — é a variável padrão do PostgreSQL, e é
# assim que dá para instalar sem alguém digitando (e testar isto aqui).
if (-not $env:PGPASSWORD) {
  $senhaPostgres = Read-Host 'Senha do usuário "postgres" (a que você definiu ao instalar o PostgreSQL)' -AsSecureString
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaPostgres)
  )
}

# Senha própria do sistema, aleatória: o ComerciON não usa o superusuário do
# banco para trabalhar, e ninguém precisa decorar mais uma senha.
$senhaApp = -join ((1..32) | ForEach-Object { 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Get-Random -Maximum 55)] })

$consulta = Executar 'psql' @('-U', 'postgres', '-h', 'localhost', '-tAc', "SELECT 1 FROM pg_database WHERE datname='comercion'")
if ($consulta.Codigo -ne 0) {
  Parar "Não consegui falar com o PostgreSQL:`n$($consulta.Saida)" @'
Confira se a senha está correta e se o serviço "postgresql" está rodando
(Menu Iniciar > Serviços > postgresql-x64-NN > Iniciar).
'@
}

if ($consulta.Saida.Trim() -eq '1') {
  Write-Host '  !   O banco "comercion" já existe — mantendo os dados que estão nele.' -ForegroundColor Yellow
  # Trocar a senha do papel garante que o .env novo continue valendo mesmo
  # numa reinstalação por cima.
  Executar 'psql' @('-U', 'postgres', '-h', 'localhost', '-q', '-c', "ALTER ROLE comercion WITH PASSWORD '$senhaApp'") | Out-Null
} else {
  Executar 'psql' @('-U', 'postgres', '-h', 'localhost', '-q', '-c', "CREATE ROLE comercion LOGIN PASSWORD '$senhaApp'") | Out-Null
  $criacao = Executar 'psql' @('-U', 'postgres', '-h', 'localhost', '-q', '-c', 'CREATE DATABASE comercion OWNER comercion')
  if ($criacao.Codigo -ne 0) {
    Parar "Não consegui criar o banco:`n$($criacao.Saida)" 'Rode o INSTALAR.bat como administrador e tente de novo.'
  }
  Write-Host '  ok  banco "comercion" criado'
}

# gen_random_uuid() é usada pelas migrations; no PostgreSQL 13+ ela é nativa,
# mas a extensão cobre instalações mais antigas sem custo nenhum.
Executar 'psql' @('-U', 'postgres', '-h', 'localhost', '-d', 'comercion', '-q', '-c', 'CREATE EXTENSION IF NOT EXISTS pgcrypto') | Out-Null
$env:PGPASSWORD = ''

# ------------------------------------------------------------------ segredos
Titulo 'Gerando os segredos deste computador'

function SegredoAleatorio {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $arquivoEnv) | Out-Null

# Os nomes abaixo são o contrato que a API valida na partida (ver
# apps/api/src/config/env.validation.ts) e são os MESMOS que o
# gerar-env-producao.sh usa. Na primeira versão deste script eu escrevi
# "JWT_SECRET" de cabeça: a instalação terminava dizendo "pronto" e a API se
# recusava a subir depois. Se um nome mudar lá, muda aqui também.
$conteudo = @"
# Gerado pelo INSTALAR.bat em $(Get-Date -Format 'dd/MM/yyyy HH:mm').
# Guarde este arquivo: os segredos abaixo assinam as sessões. Trocar um deles
# desconecta todo mundo (o que é exatamente o que você quer, se vazarem).
NODE_ENV=production
API_PORT=3001
DATABASE_URL=postgresql://comercion:$senhaApp@localhost:5432/comercion?schema=public
JWT_ACCESS_SECRET=$(SegredoAleatorio)
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=$(SegredoAleatorio)
JWT_REFRESH_EXPIRES_IN=7d
WEB_APP_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
# Sem servidor de e-mail configurado: o link de "esqueci minha senha" aparece
# na janela da API em vez de ser enviado. Suficiente para teste.
MAIL_PROVIDER=stub
"@
Set-Content -Path $arquivoEnv -Value $conteudo -Encoding UTF8
Write-Host "  ok  segredos gravados em dados\.env"

# ----------------------------------------------------------------- migrations
Titulo 'Criando as tabelas'

$env:DATABASE_URL = ($conteudo -split "`n" | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
Push-Location $api
$migracao = Executar 'node' @($prismaCli, 'migrate', 'deploy')
Pop-Location

if ($migracao.Codigo -ne 0) {
  Parar "As tabelas não foram criadas:`n$($migracao.Saida)" 'Rode o INSTALAR.bat de novo; se persistir, mande o texto acima.'
}
$aplicadas = ([regex]::Matches($migracao.Saida, 'Applying migration')).Count
if ($aplicadas -gt 0) {
  Write-Host "  ok  $aplicadas migration(s) aplicada(s)"
} else {
  Write-Host '  ok  banco já estava atualizado'
}

# -------------------------------------------------------------- prova final
Titulo 'Conferindo se o sistema sobe'

# Sem isto, o instalador dizia "pronto" e a API se recusava a subir depois,
# porque o .env tinha um nome de variável errado. Instalação que termina em
# verde precisa significar que funciona — e a única forma de saber é ligar.
Copy-Item $arquivoEnv (Join-Path $api '.env') -Force
$logDaProva = Join-Path $api 'erro-instalacao.log'
$prova = Start-Process -FilePath 'node' -ArgumentList 'dist\src\main.js' -WorkingDirectory $api `
  -WindowStyle Hidden -PassThru -RedirectStandardError $logDaProva

$subiu = $false
foreach ($tentativa in 1..40) {
  Start-Sleep -Seconds 1
  if ($prova.HasExited) { break }
  try {
    if ((Invoke-WebRequest 'http://localhost:3001/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) {
      $subiu = $true
      break
    }
  } catch {
    # Ainda subindo.
  }
}

if (-not $prova.HasExited) { Stop-Process -Id $prova.Id -Force -ErrorAction SilentlyContinue }

if (-not $subiu) {
  $erro = Get-Content $logDaProva -Raw -ErrorAction SilentlyContinue
  Parar "A API não subiu depois de instalada.`n`n$erro" @'
Isto é defeito da instalação, não do seu computador. Mande o texto acima.
'@
}
Remove-Item $logDaProva -ErrorAction SilentlyContinue
Write-Host '  ok  a API respondeu em http://localhost:3001'

Write-Host ''
Write-Host 'Pronto. O ComerciON está instalado neste computador.' -ForegroundColor Green
Write-Host ''
Write-Host 'Próximo passo: rode o INICIAR.bat.' -ForegroundColor Cyan
Write-Host 'Na primeira vez, crie sua loja na tela que abrir (link "Criar conta").'
Write-Host 'Quer dados de exemplo para experimentar? Rode DADOS-DE-EXEMPLO.bat.'
