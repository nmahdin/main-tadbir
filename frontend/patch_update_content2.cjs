const fs = require('fs');
let code = fs.readFileSync('src/context/AppContext.tsx', 'utf8');

const regex = /const updateContent = \(contentId: string, updates: Partial<Content>\) => \{[\s\S]*?\}\)\);\s*\};/;

const newFunc = `const updateContent = (contentId: string, updates: Partial<Content>) => {
    setContents(prev => prev.map(c => {
      if (c.id === contentId) {
        const newC = { ...c, ...updates, updatedAt: new Date().toISOString().split('T')[0] };
        if (updates.status === 'published' && (!newC.publishInfo || newC.publishInfo.status !== 'published')) {
           newC.publishInfo = { ...(newC.publishInfo || {}), status: 'published' };
        } else if (updates.status === 'ready_to_publish' && (!newC.publishInfo || newC.publishInfo.status !== 'ready')) {
           newC.publishInfo = { ...(newC.publishInfo || {}), status: 'ready' };
        }
        return newC;
      }
      return c;
    }));
  };`;

if(code.match(regex)) {
  code = code.replace(regex, newFunc);
  fs.writeFileSync('src/context/AppContext.tsx', code);
  console.log("Patched correctly.");
}
