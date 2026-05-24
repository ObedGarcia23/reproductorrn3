const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MUSIC_DIR = 'D:\\Musica'; // Cambia esto si tu música está en otra ruta

// Extensiones de audio soportadas
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm', '.opus']);

// Escaneo recursivo de archivos de música
function scanMusic(dir, baseDir = dir) {
  let results = [];
  try {
    if (!fs.existsSync(dir)) {
      console.warn(`La ruta no existe: ${dir}`);
      return [];
    }
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(scanMusic(filePath, baseDir));
      } else {
        const ext = path.extname(file).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          // Guardar ruta relativa para servirla
          const relativePath = path.relative(baseDir, filePath);
          // Separar título y artista tentativo por nombre de archivo o carpetas
          const dirParts = path.dirname(relativePath).split(path.sep);
          const fileNameNoExt = path.basename(file, ext);
          
          let artist = '';
          let title = fileNameNoExt.replace(/_/g, " ").trim();
          title = title.replace(/\[?SPOTIFY-DOWNLOADER\.COM\]?/gi, "").replace(/\s+/g, " ").trim();
          
          // Estructura común: Artista/Álbum/Canción.mp3
          if (dirParts.length >= 1 && dirParts[0] !== '.') {
            artist = dirParts[0].replace(/_/g, " ").trim();
          }
          
          // Buscar archivo de portada local (cover.jpg, folder.png, etc.) en el mismo directorio
          const parentDir = path.dirname(filePath);
          const possibleCovers = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'album.jpg', 'album.png'];
          let coverPath = '';
          for (const cName of possibleCovers) {
            const cPath = path.join(parentDir, cName);
            if (fs.existsSync(cPath)) {
              coverPath = path.relative(baseDir, cPath);
              break;
            }
          }
          
          results.push({
            title: title,
            artist: artist || 'Desconocido',
            path: relativePath.replace(/\\/g, '/'), // URL friendly path
            cover: coverPath ? coverPath.replace(/\\/g, '/') : null
          });
        }
      }
    });
  } catch (e) {
    console.error("Error leyendo directorio:", e);
  }
  return results;
}

const server = http.createServer((req, res) => {
  // Habilitar CORS para que tu app desplegada en internet acceda sin problemas
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Endpoint para listar canciones en formato JSON
  if (url.pathname === '/songs') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const songs = scanMusic(MUSIC_DIR);
    res.writeHead(200);
    res.end(JSON.stringify(songs));
    return;
  }
  
  // Servir archivos de música en streaming
  if (url.pathname.startsWith('/music/')) {
    const relativePath = decodeURIComponent(url.pathname.substring(7));
    const filePath = path.join(MUSIC_DIR, relativePath);
    
    // Prevenir ataques de salto de directorio
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(MUSIC_DIR);
    if (!resolvedPath.startsWith(resolvedBase)) {
      res.writeHead(403);
      res.end('Acceso denegado');
      return;
    }
    
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Archivo no encontrado');
      return;
    }
    
    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;
    
    // Determinar Content-Type dinámicamente
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'audio/mpeg';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.ogg') contentType = 'audio/ogg';
    else if (ext === '.flac') contentType = 'audio/flac';
    
    // Soporte para HTTP Range Requests (Streaming fluido estilo Spotify)
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      
      if (start >= totalSize || end >= totalSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        res.end();
        return;
      }
      
      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType
      });
      fs.createReadStream(filePath).pipe(res);
    }
    return;
  }
  
  res.writeHead(404);
  res.end('No encontrado');
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Servidor de Streaming de Música Activo!`);
  console.log(`  Escaneando carpeta: ${MUSIC_DIR}`);
  console.log(`  Puerto local: http://localhost:${PORT}`);
  console.log(`  Usa Cloudflare Tunnels para exponerlo gratis.`);
  console.log(`======================================================\n`);
});
