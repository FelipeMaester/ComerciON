# Compacta o pacote do Windows num zip pronto para levar no pen drive.
#
# Por que isto e um script e nao um comando digitado na hora: as duas formas
# obvias de compactar ja falharam em silencio. O Compress-Archive travou num
# arquivo que o antivirus segurava, e uma vez estourou o tempo e deixou um zip
# pela metade com cara de pacote pronto — 80 MB dos 180 MB, sem aviso nenhum.
# Arquivo incompleto parecendo completo e pior que arquivo nenhum: quem leva
# para o computador de destino so descobre la, com a loja parada.
#
# As tres protecoes que isto tem e o comando avulso nao tinha:
#
#   1. Monta num nome temporario (.parcial) e so renomeia depois de conferir.
#      Se falhar no meio, o zip bom da rodada anterior continua intacto.
#   2. Confere contando: numero de itens e soma dos bytes tem que bater com a
#      pasta. Nao ha lista de arquivos importantes para envelhecer aqui — se
#      um arquivo ficou de fora, a conta nao fecha, seja ele qual for.
#   3. Grava os caminhos com barra normal. O System.IO.Compression do Windows
#      PowerShell grava "sistema\api\..." com barra invertida, que e o jeito do
#      Windows e nao o jeito do formato ZIP. Os descompactadores do Windows
#      relevam; no Linux e no Mac o mesmo zip vira 30 mil arquivos soltos com
#      barra invertida no nome.

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$pasta = Join-Path $raiz 'pacote-windows'
$destino = Join-Path $raiz 'ComerciON-Windows.zip'
$parcial = "$destino.parcial"

if (-not (Test-Path (Join-Path $pasta 'INSTALAR.bat'))) {
  throw "Nao achei o pacote em $pasta. Rode antes: node scripts/gerar-pacote-windows.mjs"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host "Lendo $pasta"
$arquivos = @(Get-ChildItem $pasta -Recurse -File -Force)
# Pasta vazia nao tem arquivo que a carregue para dentro do zip: sem uma
# entrada propria ela some, e a conferencia por contagem acusaria a diferenca.
#
# -LiteralPath nao e capricho. O painel compilado tem pastas como
# ".next/server/app/(dashboard)/sales/[id]", e o Get-ChildItem sem -LiteralPath
# le o caminho como PADRAO DE BUSCA: "[id]" vira "um caractere entre i e d", a
# pasta real nunca casa, a busca volta vazia e trinta pastas CHEIAS passam por
# vazias. Os arquivos delas entram no zip do mesmo jeito (a lista acima usa
# -Recurse, que nao reinterpreta cada nome), mas a contagem mente — e a
# conferencia la embaixo compara o zip com esta contagem, entao erra junto e
# nao acusa nada. Foi assim que passou despercebido da primeira vez.
$vazias = @(Get-ChildItem $pasta -Recurse -Directory -Force |
  Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1) })
$bytesNaPasta = ($arquivos | Measure-Object -Property Length -Sum).Sum
Write-Host ("{0:N0} arquivos, {1:N1} MB" -f $arquivos.Count, ($bytesNaPasta / 1MB))

Remove-Item $parcial -Force -ErrorAction SilentlyContinue

$prefixo = $pasta.TrimEnd('\') + '\'
function Caminho-Interno($completo) {
  return $completo.Substring($prefixo.Length).Replace('\', '/')
}

$zip = [System.IO.Compression.ZipFile]::Open($parcial, 'Create')
try {
  $feitos = 0
  foreach ($a in $arquivos) {
    try {
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $a.FullName, (Caminho-Interno $a.FullName),
        [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    } catch {
      # Falha num arquivo so costuma ser o antivirus segurando ele. Morrer aqui
      # dizendo qual foi e melhor que entregar um pacote sem ele.
      throw "Nao consegui ler $($a.FullName): $($_.Exception.Message)"
    }
    $feitos++
    if ($feitos % 5000 -eq 0) { Write-Host ("  {0:N0} de {1:N0}" -f $feitos, $arquivos.Count) }
  }
  foreach ($d in $vazias) { $zip.CreateEntry((Caminho-Interno $d.FullName) + '/') | Out-Null }
} finally {
  $zip.Dispose()
}

Write-Host 'Conferindo o zip por dentro'
$conf = [System.IO.Compression.ZipFile]::OpenRead($parcial)
try {
  $itens = $conf.Entries.Count
  $bytesNoZip = ($conf.Entries | Measure-Object -Property Length -Sum).Sum
  $esperado = $arquivos.Count + $vazias.Count
  if ($itens -ne $esperado) { throw "O zip tem $itens itens; a pasta tem $esperado." }
  if ($bytesNoZip -ne $bytesNaPasta) {
    throw "O zip guarda $bytesNoZip bytes; a pasta tem $bytesNaPasta."
  }
  if ($conf.Entries | Where-Object { $_.FullName -like '*\*' }) {
    throw 'Sobrou barra invertida em nome de entrada.'
  }
} finally {
  $conf.Dispose()
}

# So agora o zip da rodada anterior sai de cena.
Remove-Item $destino -Force -ErrorAction SilentlyContinue
Move-Item $parcial $destino

$tamanho = (Get-Item $destino).Length
Write-Host ''
Write-Host ("Pacote pronto: {0} ({1:N1} MB, {2:N0} itens)" -f $destino, ($tamanho / 1MB), $esperado)
