const fs = require('fs');
let code = fs.readFileSync('src/context/AppContext.tsx', 'utf8');

const badBlock = `activities,
        departments,
        workflows,
        contents,`;

code = code.split(badBlock).join('activities,');
fs.writeFileSync('src/context/AppContext.tsx', code);
