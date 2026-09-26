const { spawn } = require('child_process');
const http = require('http');

console.log('Starting Vite development server...');
const vite = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });

function checkViteReady() {
  const req = http.request({
    hostname: 'localhost',
    port: 5173,
    method: 'GET',
    timeout: 1000
  }, (res) => {
    console.log('Vite server is ready! Launching Electron...');
    const electron = spawn('npx', ['electron', '.', '--disable-gpu', '--disable-gpu-sandbox', '--no-sandbox'], { stdio: 'inherit', shell: true });
    
    electron.on('close', () => {
      console.log('Electron closed. Stopping Vite...');
      vite.kill();
      process.exit();
    });
  });
  
  req.on('error', () => {
    // Retry check
    setTimeout(checkViteReady, 300);
  });
  
  req.end();
}

// Start checking after a short delay
setTimeout(checkViteReady, 1000);
