const fs = require('fs');
let code = fs.readFileSync('src/components/content/ContentPublishingView.tsx', 'utf8');

code = code.replace("const isReady = || c.status === 'ready_to_publish';", "const isReady = c.publishInfo?.status === 'ready' || c.status === 'ready_to_publish';");

// Wait, are there other places? Let's check for " = ||" or " ? ||" or something.
fs.writeFileSync('src/components/content/ContentPublishingView.tsx', code);
