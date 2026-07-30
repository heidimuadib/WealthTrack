function Process-Module($module) {
    try {
        $gradlePath = Join-Path $module.FullName "android\build.gradle"
        if (Test-Path $gradlePath) {
            $content = Get-Content $gradlePath -Raw
            $originalContent = $content
            $modified = $false

            # 1. Patch Namespace if missing
            if ($content -notmatch "namespace\s") {
                $manifestPath = Join-Path $module.FullName "android\src\main\AndroidManifest.xml"
                if (Test-Path $manifestPath) {
                    $manifest = Get-Content $manifestPath -Raw
                    if ($manifest -match 'package="([^"]+)"') {
                        $package = $matches[1]
                        Write-Host "Injecting namespace '$package' into $($module.Name)"
                        $content = $content -replace 'android\s*\{', "android {`n    namespace '$package'"
                        $modified = $true
                    }
                }
            }

            # 2. Patch buildConfig if missing
            # Check if buildConfig is explicitly enabled
            if ($content -notmatch "buildConfig\s+true") {
                Write-Host "Enabling buildConfig in $($module.Name)"
                # Just insert it at the start of android block for simplicity
                # If we just added namespace, we might be stacking edits, which is fine regex-wise if we are careful.
                # simpler: insert it after 'android {'
                # If we already replaced it in memory, $content has 'android {'.
                
                # Check if buildFeatures block exists
                if ($content -match "buildFeatures\s*\{") {
                     if ($content -notmatch "buildConfig\s+true") {
                        # Add to existing buildFeatures (simplified: careless replace might be tricky, but let's try strict regex)
                        $content = $content -replace '(buildFeatures\s*\{)', "$1`n        buildConfig true"
                        $modified = $true
                     }
                } else {
                    # No buildFeatures block, add it inside android {
                    $content = $content -replace 'android\s*\{', "android {`n    buildFeatures { buildConfig true }"
                    $modified = $true
                }
            }

            if ($modified) {
                Set-Content $gradlePath $content
                Write-Host "Updated $($module.Name)"
            }
        }
    } catch {
        Write-Host "Error processing $($module.Name): $_"
    }
}

$modules = Get-ChildItem -Path "..\node_modules" -Directory
foreach ($module in $modules) {
    # Check deeper due to scoped packages like @react-native-community
    if ($module.Name.StartsWith("@")) {
         $subModules = Get-ChildItem -Path $module.FullName -Directory
         foreach ($sub in $subModules) {
             Process-Module -module $sub
         }
    } else {
         Process-Module -module $module
    }
}
