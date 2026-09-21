const fs = require('fs');
let code = fs.readFileSync('src/context/AppContext.tsx', 'utf8');

const newMethod = `
  const removeStageDeliverable = (contentId: string, stageId: string, outputId: string) => {
    setContents(prev => prev.map(c => {
      if (c.id !== contentId) return c;
      const updatedStages = (c.stages || []).map(stg => {
        if (stg.id !== stageId) return stg;
        return {
          ...stg,
          outputs: stg.outputs.filter(out => out.id !== outputId)
        };
      });
      return { ...c, stages: updatedStages };
    }));
  };
`;

code = code.replace("const approveStage = (contentId: string, stageId: string, note?: string) => {", newMethod + "\n  const approveStage = (contentId: string, stageId: string, note?: string) => {");

code = code.replace("addStageDeliverable,", "addStageDeliverable,\n        removeStageDeliverable,");
fs.writeFileSync('src/context/AppContext.tsx', code);
