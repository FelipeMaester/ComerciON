# Desliga o ComerciON.
#
# Mata só os processos DESTA instalação. A primeira versão procurava o caminho
# da pasta na linha de comando do processo — e nunca achava nada: como o
# INICIAR passa `dist\src\main.js` com o diretório de trabalho separado, a
# linha de comando é só "node dist\src\main.js", sem caminho nenhum. O PARAR
# dizia "não está rodando" com o sistema no ar.
#
# Agora o INICIAR anota os números dos processos e este script lê a anotação.

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$anotacao = Join-Path $raiz 'dados\processos.txt'

if (-not (Test-Path $anotacao)) {
  Write-Host 'O ComerciON não está rodando (ou foi iniciado fora do INICIAR.bat).' -ForegroundColor Yellow
  exit 0
}

$desligados = 0
foreach ($linha in Get-Content $anotacao) {
  $numero = 0
  if (-not [int]::TryParse($linha.Trim(), [ref]$numero)) { continue }

  # Conferir que ainda é um node antes de matar: o Windows reaproveita número
  # de processo, e derrubar o programa errado de alguém seria imperdoável.
  $processo = Get-Process -Id $numero -ErrorAction SilentlyContinue
  if ($processo -and $processo.ProcessName -eq 'node') {
    Stop-Process -Id $numero -Force -ErrorAction SilentlyContinue
    $desligados++
  }
}

Remove-Item $anotacao -ErrorAction SilentlyContinue

if ($desligados -eq 0) {
  Write-Host 'O ComerciON já estava desligado.' -ForegroundColor Yellow
} else {
  Write-Host "ComerciON desligado ($desligados processo(s))." -ForegroundColor Green
}
Write-Host 'Os dados continuam salvos no banco. Rode o INICIAR.bat quando quiser voltar.'
