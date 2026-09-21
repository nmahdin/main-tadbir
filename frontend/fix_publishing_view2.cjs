const fs = require('fs');
let code = fs.readFileSync('src/components/content/ContentPublishingView.tsx', 'utf8');

const badString1 = "(c.publishInfo?.status === 'ready' || c.status === 'ready_to_publish')";

// Remove all occurrences
code = code.split(badString1).join('');

fs.writeFileSync('src/components/content/ContentPublishingView.tsx', code);
