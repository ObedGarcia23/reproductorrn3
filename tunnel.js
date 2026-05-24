const { spawn } = require('child_process');

console.log("Iniciando túnel rápido de Cloudflare de forma 100% silenciosa...");
// Al no usar { shell: true }, evitamos por completo que Windows abra y cierre ventanas de terminal en tu pantalla.
const child = spawn('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', ['tunnel', '--url', 'http://localhost:3000']);

child.stdout.on('data', (data) => {
  process.stdout.write(data);
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('close', (code) => {
  console.log(`El túnel se cerró con el código: ${code}`);
});
