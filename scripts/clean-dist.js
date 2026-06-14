// Clear dist/ contents only — keep the dist directory (same idea as :clean_dir_contents in local *.bat builds).
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) {
    fs.mkdirSync(dist, { recursive: true });
    process.exit(0);
}
for (const entry of fs.readdirSync(dist)) {
    fs.rmSync(path.join(dist, entry), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
