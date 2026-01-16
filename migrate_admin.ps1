# PowerShell script to batch migrate Admin mockDB calls to Supabase
$files = @(
    'src\components\modules\Admin\components\UserManagement.jsx',
    'src\components\modules\Admin\components\GroupManagement.jsx',
    'src\components\modules\Admin\components\AdminDashboard.jsx',
    'src\components\modules\Reports\components\ReportReadView.jsx'
)

foreach ($file in $files) {
    $fullPath = Join-Path "C:\Users\Rodrigo\Downloads\V11-code_backup" $file
    if (Test-Path $fullPath) {
        Write-Host "Processing: $file"
        $content = (Get-Content $fullPath -Raw)
        
        # Replace imports
        $content = $content -replace "import \{ mockDB \} from '@/lib/mockDatabase';", "import { supabase } from '@/lib/supabase';"
        
        # Replace mockDB calls with supabase equivalents
        $content = $content -replace 'await mockDB\.select\(''([^'']+)''\)', 'await supabase.from(''$1'').select(''*'')'
        $content = $content -replace 'await mockDB\.select\(''([^'']+)'',\s*\{', 'await supabase.from(''$1'').select(''*'').'
        $content = $content -replace 'await mockDB\.insert\(''([^'']+)'',', 'await supabase.from(''$1'').insert('
        $content = $content -replace 'await mockDB\.update\(''([^'']+)'',\s*([^,]+),', 'await supabase.from(''$1'').update('
        $content = $content -replace 'await mockDB\.delete\(''([^'']+)'',\s*([^)]+)\)', 'await supabase.from(''$1'').delete().eq(''id'', $2)'
        $content = $content -replace 'await mockDB\.count\(''([^'']+)''\)', 'await supabase.from(''$1'').select(''*'', { count: ''exact'', head: true })'
        $content = $content -replace 'await mockDB\.count\(''([^'']+)'',\s*\{', 'await supabase.from(''$1'').select(''*'', { count: ''exact'', head: true }).'
        
        # Additional fixes for query patterns
        $content = $content -replace '\{ eq: \{ ([^}]+) \} \}', 'eq(''$1'')'
        
        Set-Content -Path $fullPath -Value $content
        Write-Host "✓ Migrated: $file" -ForegroundColor Green
    } else {
        Write-Host "✗ Not found: $file" -ForegroundColor Red
    }
}

Write-Host "`nMigration complete!" -ForegroundColor Cyan
