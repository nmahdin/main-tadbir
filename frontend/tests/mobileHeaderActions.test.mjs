import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/layout/TopNavbar.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');

const buttonMarkup = id => {
  const start = navbar.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `Missing button: ${id}`);
  const end = navbar.indexOf('</button>', start);
  return navbar.slice(start, end);
};

test('mobile sidebar toggle is shown below lg and opens sidebar', () => {
  const button = buttonMarkup('mobile-sidebar-toggle');
  assert.match(button, /lg:hidden/);
  assert.match(button, /inline-flex/);
  assert.doesNotMatch(button, /(?:^|\s)hidden(?:\s|")/);
  assert.match(button, /onClick=\{onOpenSidebar\}/);
  assert.match(app, /<TopNavbar onOpenSidebar=\{\(\) => setIsSidebarOpen\(true\)\}/);
  assert.match(sidebar, /isOpen \? 'translate-x-0' : 'translate-x-full'/);
});

test('small phone displays global-search icon and keeps larger search field', () => {
  const button = buttonMarkup('top-search-btn');
  assert.match(button, /inline-flex/);
  assert.match(button, /sm:hidden/);
  assert.match(button, /onClick=\{\(\) => setIsSearchOpen\(true\)\}/);
  assert.match(navbar, /id="top-search-bar"/);
  assert.match(navbar, /hidden sm:flex items-center/);
});
