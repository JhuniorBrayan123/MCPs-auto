Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Instalador del Servidor MCP Auditor" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Verificar Python
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python no esta instalado o no esta en las variables de entorno (PATH)." -ForegroundColor Red
    Pause
    exit
}

# 2. Entorno Virtual
$venvPath = Join-Path $PSScriptRoot "venv"
if (-not (Test-Path "$venvPath")) {
    Write-Host "[INFO] Creando entorno virtual..." -ForegroundColor Yellow
    python -m venv "$venvPath"
}

# 3. Instalar Dependencias
Write-Host "[INFO] Instalando dependencias necesarias..." -ForegroundColor Yellow
$pipPath = Join-Path $venvPath "Scripts\pip.exe"
$reqPath = Join-Path $PSScriptRoot "requirements.txt"
& "$pipPath" install -r "$reqPath" -q

# 4. Crear .env
$envPath = Join-Path $PSScriptRoot ".env"
$envExamplePath = Join-Path $PSScriptRoot ".env.example"
if (-not (Test-Path "$envPath")) {
    Write-Host "[INFO] Creando archivo .env por defecto..." -ForegroundColor Yellow
    Copy-Item "$envExamplePath" "$envPath"
}

# 5. Configurar Claude
Write-Host "[INFO] Vinculando el servidor con Claude Desktop..." -ForegroundColor Yellow
$claudePaths = @(
    "$env:APPDATA\Claude\claude_desktop_config.json",
    "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json"
)

$targetConfigPath = $null
foreach ($path in $claudePaths) {
    $dir = Split-Path $path -Parent
    if (Test-Path $dir) {
        $targetConfigPath = $path
        break
    }
}

if ($targetConfigPath) {
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"
    $serverPy = Join-Path $PSScriptRoot "server.py"
    
    $config = @{}
    if (Test-Path $targetConfigPath) {
        try {
            # Leer el JSON existente
            $jsonContent = Get-Content $targetConfigPath -Raw
            if ([string]::IsNullOrWhiteSpace($jsonContent)) { $jsonContent = "{}" }
            $config = $jsonContent | ConvertFrom-Json -AsHashtable
        } catch {
            Write-Host "[ADVERTENCIA] No se pudo leer el archivo de config de Claude. Se sobrescribira." -ForegroundColor Yellow
        }
    }
    
    if (-not $config.ContainsKey("mcpServers")) {
        $config["mcpServers"] = @{}
    }
    
    $mcpServers = $config["mcpServers"]
    $mcpServers["sql-auditor"] = @{
        "command" = $pythonExe.Replace('\', '\\')
        "args" = @($serverPy.Replace('\', '\\'))
    }
    
    # Escribir el json de vuelta
    $config | ConvertTo-Json -Depth 10 | Set-Content "$targetConfigPath"
    Write-Host "[EXITO] Claude configurado correctamente en: $targetConfigPath" -ForegroundColor Green
} else {
    Write-Host "[ADVERTENCIA] No se encontro la instalacion de Claude Desktop. Tendras que configurarlo en n8n manualmente." -ForegroundColor Yellow
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "[EXITO] Instalacion automatica completada." -ForegroundColor Green
Write-Host "Por favor, abre el archivo .env, coloca tus contrasenas y reinicia Claude Desktop." -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
Pause
