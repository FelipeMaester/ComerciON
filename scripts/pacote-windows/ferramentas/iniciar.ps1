# Sobe o ComerciON: API e painel, e abre o navegador.
#
# Os dois processos ficam em janelas próprias e minimizadas. Fechar as janelas
# encerra o sistema — é o PARAR.bat de emergência de quem não leu o LEIAME.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$api = Join-Path $raiz 'sistema\api'
$painel = Join-Path $raiz 'sistema\painel'
$arquivoEnv = Join-Path $raiz 'dados\.env'

if (-not (Test-Path $arquivoEnv)) {
  Write-Host ''
  Write-Host 'PROBLEMA: o sistema ainda nao foi instalado neste computador.' -ForegroundColor Red
  Write-Host 'Rode o INSTALAR.bat primeiro.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

# A API lê o .env do diretório onde roda; uma cópia evita ter de duplicar a
# configuração à mão e mantém o original como fonte única.
Copy-Item $arquivoEnv (Join-Path $api '.env') -Force

Write-Host 'Subindo o ComerciON...' -ForegroundColor Green

$processoApi = Start-Process -FilePath 'node' -ArgumentList 'dist\src\main.js' -WorkingDirectory $api `
  -WindowStyle Minimized -PassThru

$processoPainel = Start-Process -FilePath 'node' -ArgumentList 'node_modules\next\dist\bin\next', 'start', '-p', '3000' `
  -WorkingDirectory $painel -WindowStyle Minimized -PassThru

# O PARAR precisa saber quem desligar. Não dá para descobrir depois: como os
# dois sobem com o diretório de trabalho separado do argumento, a linha de
# comando deles é só "node dist\src\main.js" — sem nada que os ligue a esta
# pasta. Anotar na hora é o que torna o desligamento preciso.
Set-Content -Path (Join-Path $raiz 'dados\processos.txt') `
  -Value @($processoApi.Id, $processoPainel.Id)

# Esperar de verdade em vez de dormir um número mágico: em máquina lenta o
# sleep fixo abre o navegador antes da hora e o usuário vê uma tela de erro.
Write-Host 'Aguardando o sistema responder...'
$pronto = $false
foreach ($tentativa in 1..60) {
  Start-Sleep -Seconds 1
  try {
    $api_ok = (Invoke-WebRequest 'http://localhost:3001/api/health' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200
    $painel_ok = (Invoke-WebRequest 'http://localhost:3000/login' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200
    if ($api_ok -and $painel_ok) { $pronto = $true; break }
  } catch {
    # Ainda subindo — normal nos primeiros segundos.
  }
}

if (-not $pronto) {
  Write-Host ''
  Write-Host 'O sistema nao respondeu em 60 segundos.' -ForegroundColor Red
  Write-Host 'Olhe as duas janelas minimizadas na barra de tarefas: a mensagem de erro esta la.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

Write-Host ''
Write-Host 'ComerciON no ar.' -ForegroundColor Green
Write-Host '  Painel: http://localhost:3000'
Write-Host '  API:    http://localhost:3001/docs'
Write-Host ''
Write-Host 'Para desligar, rode o PARAR.bat.'
Start-Process 'http://localhost:3000'
