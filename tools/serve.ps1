<#
  serve.ps1 - a static file server for local iteration.

  WHY THIS EXISTS. The game loads ~36 classic <script> tags from src/, and
  file:// blocks those as cross-origin, so opening index.html directly gives a
  blank page. There is no Node or Python on this machine (see the ground
  rules), so the server has to come from PowerShell itself.

  It serves the SOURCE tree, not dist/. That is the point: editing a file in
  src/ and reloading is the whole local loop, whereas dist/play.html is a build
  artefact you would have to rebuild every time.

  ASCII ONLY, DELIBERATELY. PowerShell 5.1 reads a .ps1 with no byte-order mark
  as ANSI, so a UTF-8 em dash in a comment is decoded as two junk characters and
  the parser then reports a missing string terminator sixty lines away. That
  happened. Keeping the file to plain ASCII removes the dependency on how it was
  saved.

  YOU HAVE TO START IT YOURSELF, and that is not a shortcoming of the
  script. An agent session cannot hold this open: the sandbox reaps the
  whole process tree when the shell call that started it returns, and
  Start-Process detaching does not survive it either. Verified by
  netstat - after the call ends there is no LISTENING socket, only
  TIME_WAIT leftovers from requests that did work.

  So a request inside one shell call succeeds and the identical request
  in the next call fails. That is the teardown, not your machine, and
  not a port clash.

    powershell -ExecutionPolicy Bypass -File tools/serve.ps1
    powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8090
#>
param([int]$Port = 8080)

$root = Split-Path -Parent $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")

try { $listener.Start() }
catch {
  Write-Host "Could not listen on port $Port - it is probably already in use."
  Write-Host "Try:  powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8090"
  exit 1
}

Write-Host "Bedroom Racers, serving $root"
Write-Host "  http://localhost:$Port/"
Write-Host "Ctrl-C to stop."

# Content types matter: .html served as octet-stream downloads instead of
# rendering, and a .js served as text/plain is refused in some configurations.
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

  $full = Join-Path $root $rel
  $fullResolved = [System.IO.Path]::GetFullPath($full)
  $rootResolved = [System.IO.Path]::GetFullPath($root)

  # Never serve outside the project, whatever the URL asks for.
  if ($fullResolved.StartsWith($rootResolved) -and (Test-Path $fullResolved -PathType Leaf)) {
    $ext = [System.IO.Path]::GetExtension($fullResolved).ToLower()
    if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] }
    else { $ctx.Response.ContentType = 'application/octet-stream' }
    # No caching, or an edited source file keeps serving the old copy and the
    # local loop quietly stops being local.
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $bytes = [System.IO.File]::ReadAllBytes($fullResolved)
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 not found")
    $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
  }
  $ctx.Response.OutputStream.Close()
}
