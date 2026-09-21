const fs = require('fs');
let code = fs.readFileSync('src/context/AppContext.tsx', 'utf8');

const oldFunc = `  const updateContentPublishInfo = (contentId: string, publishInfo: Partial<Content['publishInfo']>) => {
    setContents(prev => prev.map(c => {
      if (c.id === contentId) {
        return {
          ...c,
          publishInfo: {
            ...c.publishInfo,
            ...publishInfo
          },
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return c;
    }));
  };`;

const newFunc = `  const updateContentPublishInfo = (contentId: string, publishInfo: Partial<Content['publishInfo']>) => {
    setContents(prev => prev.map(c => {
      if (c.id === contentId) {
        const newPublishInfo = { ...c.publishInfo, ...publishInfo };
        let newStatus = c.status;
        if (newPublishInfo.status === 'published') {
          newStatus = 'published';
        } else if (newPublishInfo.status === 'ready' && c.status !== 'published') {
          newStatus = 'ready_to_publish';
        }
        
        return {
          ...c,
          status: newStatus,
          publishInfo: newPublishInfo,
          updatedAt: new Date().toISOString().split('T')[0]
        };
      }
      return c;
    }));
  };`;

if(code.includes(oldFunc)) {
  code = code.replace(oldFunc, newFunc);
  fs.writeFileSync('src/context/AppContext.tsx', code);
  console.log("Patched AppContext.tsx successfully.");
} else {
  console.log("Could not find old function precisely");
}
