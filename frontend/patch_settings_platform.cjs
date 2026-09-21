const fs = require('fs');
let code = fs.readFileSync('src/components/settings/SettingsView.tsx', 'utf8');

code = code.replace(/icon: newPlatformIcon,/g, "iconName: newPlatformIcon,");

fs.writeFileSync('src/components/settings/SettingsView.tsx', code);
