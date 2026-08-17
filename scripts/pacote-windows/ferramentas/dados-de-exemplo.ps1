# Carrega a loja de demonstração (AutoPeças Demo) com produtos, clientes e
# vendas de exemplo.
#
# Opcional, e separado do INSTALAR de propósito: quem vai testar com os
# próprios dados não quer uma loja fictícia no meio.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$api = Join-Path $raiz 'sistema\api'
# O compilador preserva a estrutura de pastas: o seed importa de ../src, entao
# a raiz comum vira apps/api e a saida fica em exemplo\prisma\seed.js.
$seed = Join-Path $raiz 'sistema\api\exemplo\prisma\seed.js'
$arquivoEnv = Join-Path $raiz 'dados\.env'

if (-not (Test-Path $arquivoEnv)) {
  Write-Host 'Rode o INSTALAR.bat primeiro.' -ForegroundColor Red
  exit 1
}

$env:DATABASE_URL = ((Get-Content $arquivoEnv | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', '')

Write-Host 'Carregando a loja de exemplo...' -ForegroundColor Green
Write-Host ''

# Roda a partir da API para achar o @prisma/client e o bcrypt que o seed usa.
#
# ErrorActionPreference em 'Continue' durante a chamada: no PowerShell 5.1
# qualquer linha que um programa externo escreva no stderr vira erro fatal
# quando o preference é 'Stop' — e stderr não quer dizer falha. O instalador
# morria por causa de um aviso do psql. Quem decide é o código de saída.
Push-Location $api
$anterior = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& node $seed
$codigo = $LASTEXITCODE
$ErrorActionPreference = $anterior
Pop-Location

if ($codigo -ne 0) {
  Write-Host ''
  Write-Host 'Nao consegui carregar os dados de exemplo.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'Pronto. Entre no painel com:' -ForegroundColor Green
Write-Host '  Empresa: demo'
Write-Host '  E-mail:  admin@demo.local'
Write-Host '  Senha:   Demo1234'
