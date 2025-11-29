import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = process.env.PORT || 10000;
const distPath = path.join(__dirname, 'dist');

const server = http.createServer((req, res) => {
    console.log(`Request: ${req.url}`);

    // Health Check
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }

    // Debug: List files in dist
    if (req.url === '/debug-files') {
        fs.readdir(distPath, (err, files) => {
            if (err) {
                res.writeHead(500);
                res.end(`Error listing files: ${err.message}`);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`Files in ${distPath}:\n${files.join('\n')}`);
            }
        });
        return;
    }

    // Default to index.html for root
    let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);

    // SPA Routing: If no extension, serve index.html
    if (!path.extname(req.url)) {
        filePath = path.join(distPath, 'index.html');
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                console.log(`File not found: ${filePath}, falling back to index.html`);
                // Fallback to index.html for SPA routing
                fs.readFile(path.join(distPath, 'index.html'), (err, indexContent) => {
                    if (err) {
                        console.error('CRITICAL: index.html missing from dist folder!');
                        res.writeHead(500);
                        res.end('Error: index.html not found. Build failed or dist folder empty.');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(indexContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Serving files from ${distPath}`);
});
