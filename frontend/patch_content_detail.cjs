const fs = require('fs');
let code = fs.readFileSync('src/components/content/ContentDetailView.tsx', 'utf8');

const regexAssignee = /<div className="flex items-center gap-1\.5 bg-slate-50 px-2\.5 py-1\.5 rounded-xl border border-slate-200">[\s\S]*?<\/div>/;
code = code.replace(regexAssignee, `
<div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
  {assignedUser ? (
    <>
      <Avatar user={assignedUser} size="xs" />
      <span className="font-bold text-slate-800 text-xs px-1 py-0.5">{assignedUser.name}</span>
    </>
  ) : (
    <>
      <Users className="w-3.5 h-3.5 text-slate-400" />
      <span className="font-bold text-slate-500 text-xs px-1 py-0.5">بدون مسئول</span>
    </>
  )}
</div>
`);

const regexApprover = /<div className="flex items-center gap-1\.5 bg-amber-50 px-2\.5 py-1\.5 rounded-xl border border-amber-200">[\s\S]*?<\/div>/;
code = code.replace(regexApprover, `
<div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200">
  {(() => {
    const approver = users.find(u => u.id === stage.approverId);
    return approver ? (
      <>
        <Avatar user={approver} size="xs" />
        <span className="font-bold text-amber-800 text-xs px-1 py-0.5">{approver.name}</span>
      </>
    ) : (
      <>
        <Users className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-bold text-amber-700 text-xs px-1 py-0.5">بدون ارزیاب</span>
      </>
    );
  })()}
</div>
`);

fs.writeFileSync('src/components/content/ContentDetailView.tsx', code);
