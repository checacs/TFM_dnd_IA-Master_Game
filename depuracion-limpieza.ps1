# depuracion-limpieza.ps1
# Paso final de la depuracion (Claude, sept. 2026). Ejecutalo UNA vez desde la
# raiz del repo TFM, en PowerShell:
#     powershell -ExecutionPolicy Bypass -File .\depuracion-limpieza.ps1
#
# 1) Borra del disco y de git los archivos muertos (scripts vacios, restos
#    .trash, mappers que se movieron de carpeta, DiceRollPanel sin uso...).
# 2) Deja de versionar las carpetas .idea y ui-web/.env.production SIN
#    borrarlas de tu disco (siguen ahi para WebStorm; ya estan en .gitignore).
# No hace commit: revisa los cambios con `git status` y commitea tu.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$archivosMuertos = @(
  "API_REST TFM/assets/fondos/.trash_preview_cutout.png",
  "API_REST TFM/assets/fondos/.trash_preview_cutout2.png",
  "API_REST TFM/assets/fondos/.trash_preview_text_crop.png",
  "API_REST TFM/assets/fondos/.trash_preview_text_crop2.png",
  "API_REST TFM/jest.tmp.config.js",
  "API_REST TFM/src/index.ts",
  "API_REST TFM/src/infrastructure/dnd5eapi/magic-item.mapper.ts",
  "API_REST TFM/src/infrastructure/dnd5eapi/rules-reference.mapper.ts",
  "API_REST TFM/src/interface/http/games/dto/send-message.dto.ts",
  "API_REST TFM/src/verify-create-user.ts",
  "API_REST TFM/src/verify-get-character.ts",
  "API_REST TFM/src/verify-turn-system.ts",
  "API_REST TFM/src/verify-turn-usecases.ts",
  "dm-engine/.DS_Store",
  "dm-engine/src/verify-enemy-nudge.ts",
  "ui-web/public_old_unused/.gitkeep",
  "ui-web/public_old_unused/fondo_aventura.jpg",
  "ui-web/public_old_unused/pantalla_inicial.png",
  "ui-web/src/components/game/DiceRollPanel.tsx"
)

foreach ($f in $archivosMuertos) {
  if (Test-Path -LiteralPath $f) {
    git rm -q -f -- "$f"
    Write-Host "borrado: $f"
  }
}

$sinVersionar = @('.idea', 'API_REST TFM/.idea', 'dm-engine/.idea', 'mobile-app/.idea', 'ui-web/.idea', 'ui-web/.env.production')
foreach ($p in $sinVersionar) {
  git rm -r -q --cached --ignore-unmatch -- "$p"
  Write-Host "ya no se versiona (sigue en disco): $p"
}

Write-Host ''
Write-Host 'Listo. Siguiente paso: npm test en "API_REST TFM" y en dm-engine, y revisar git status antes de commitear.'
