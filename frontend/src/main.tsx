import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installStaleBuildRecovery } from './utils/staleBuildRecovery';

// پیش از رندر، بازیابی «نسخهٔ کهنهٔ مرورگر» فعال می‌شود تا باز کردن صفحه‌هایی که
// فایلشان بعد از به‌روزرسانی سامانه عوض شده است، خودکار تازه‌سازی شود.
installStaleBuildRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
