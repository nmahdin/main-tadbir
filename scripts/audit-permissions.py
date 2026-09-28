#!/usr/bin/env python3
"""Read-only source inventory. Literal references are NOT proof of enforcement.

Usage: python scripts/audit-permissions.py --routes /path/to/route-list.json
Obtain routes locally with: cd backend && php artisan route:list --json --path=api/v1
No credentials, environment values, database records or user data are collected.
"""
import argparse
import collections
import csv
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--routes', type=Path)
args = parser.parse_args()
out = ROOT / 'docs/security'
out.mkdir(parents=True, exist_ok=True)
seed = (ROOT / 'backend/database/seeders/PermissionSeeder.php').read_text()
entries = [dict(zip(['key', 'label', 'description', 'category'], match)) for match in re.findall(
    r"\['key' => '([^']+)', 'label' => '([^']+)', 'description' => '([^']+)', 'category' => '([^']+)'\]", seed)]
frontend = (ROOT / 'frontend/src/data/initialData.ts').read_text().split('export const INITIAL_ROLES')[0]
frontend_keys = set(re.findall(r'\bid:\s*[\'"]([a-z_]+\.[a-z_]+)[\'"]', frontend))
keys = {entry['key'] for entry in entries}
refs = {side: collections.defaultdict(set) for side in ['backend', 'frontend']}
for side, folders, extensions in [
    ('backend', ['backend/app', 'backend/routes'], {'.php'}),
    ('frontend', ['frontend/src'], {'.ts', '.tsx'}),
]:
    for folder in folders:
        for path in (ROOT / folder).rglob('*'):
            if path.suffix not in extensions or path.name == 'initialData.ts':
                continue
            for line_no, line in enumerate(path.read_text().splitlines(), 1):
                literals = re.findall(r"['\"]([a-z_]+\.[a-z_]+)['\"]", line)
                for middleware in re.findall(r"['\"]permission:([^'\"]+)['\"]", line):
                    literals.extend(middleware.split(','))
                for key in set(literals) & keys:
                    refs[side][key].add(f'{path.relative_to(ROOT)}:{line_no}')
with (out / 'permission-inventory.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream)
    writer.writerow(['key', 'label', 'category', 'in_frontend_catalog', 'backend_literal_references_NOT_proof_of_enforcement', 'frontend_literal_references'])
    for entry in entries:
        key = entry['key']
        writer.writerow([key, entry['label'], entry['category'], key in frontend_keys,
                         '; '.join(sorted(refs['backend'][key])), '; '.join(sorted(refs['frontend'][key]))])
summary = {
    'kind': 'static-inventory-not-an-authorization-proof',
    'permission_count': len(entries),
    'counts_by_category': dict(collections.Counter(e['category'] for e in entries)),
    'only_backend_catalog': sorted(keys - frontend_keys),
    'only_frontend_catalog': sorted(frontend_keys - keys),
    'no_backend_literal_reference': sorted(key for key in keys if not refs['backend'].get(key)),
}
if args.routes:
    routes = json.loads(args.routes.read_text())
    with (out / 'route-inventory.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['methods', 'uri', 'action', 'middleware_NOT_complete_policy'])
        for route in routes:
            writer.writerow([route['method'], route['uri'], route['action'], '; '.join(route['middleware'])])
    summary['route_entry_count'] = len(routes)
(out / 'inventory-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
