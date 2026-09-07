const fs = require('node:fs');
fs.cpSync('src/ui', 'dist/ui', { recursive: true });
