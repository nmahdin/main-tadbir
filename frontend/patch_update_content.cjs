const fs = require('fs');
let code = fs.readFileSync('src/context/AppContext.tsx', 'utf8');

const oldUpdateContent = `  const updateContent = (id: string, updates: Partial<Content>) => {
    setContents(prev => prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString().split('T')[0] } : c));
  };`;
  
const newUpdateContent = `  const updateContent = (id: string, updates: Partial<Content>) => {
    setContents(prev => prev.map(c => {
      if (c.id === id) {
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

if(code.includes(oldUpdateContent)) {
  code = code.replace(oldUpdateContent, newUpdateContent);
  fs.writeFileSync('src/context/AppContext.tsx', code);
  console.log("updateContent patched.");
} else {
  console.log("Could not find updateContent.");
}
