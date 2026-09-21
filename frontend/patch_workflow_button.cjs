const fs = require('fs');
let code = fs.readFileSync('src/components/content/ContentDetailView.tsx', 'utf8');

const oldButton = `<button 
                onClick={() => setIsEditWorkflowOpen(true)}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                ویرایش جریان و مراحل
              </button>`;
const newButton = `{hasPermission('content.manage_process') && (
              <button 
                onClick={() => setIsEditWorkflowOpen(true)}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                ویرایش جریان و مراحل
              </button>
            )}`;

if(code.includes(oldButton)) {
  code = code.replace(oldButton, newButton);
  fs.writeFileSync('src/components/content/ContentDetailView.tsx', code);
}
