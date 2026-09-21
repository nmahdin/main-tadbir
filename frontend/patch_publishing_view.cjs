const fs = require('fs');
let code = fs.readFileSync('src/components/content/ContentPublishingView.tsx', 'utf8');

code = code.replace(/c\.publishInfo\?\.status === 'published'/g, "(c.publishInfo?.status === 'published' || c.status === 'published')");
code = code.replace(/c\.publishInfo\?\.status === 'ready' || c\.status === 'ready_to_publish'/g, "(c.publishInfo?.status === 'ready' || c.status === 'ready_to_publish')");
// Update filters too
code = code.replace(/c\.publishInfo\?\.status \|\| 'planned'/g, "c.status === 'published' ? 'published' : c.status === 'ready_to_publish' ? 'ready' : (c.publishInfo?.status || 'planned')");

fs.writeFileSync('src/components/content/ContentPublishingView.tsx', code);
