"""Rebuild static audit inventories without importing or executing upstream code."""
import ast
import csv
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent / 'upstream'


def write_csv(name, rows, columns):
    with (HERE / name).open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


files, symbols, headings, errors = [], [], [], []
tracked = subprocess.check_output(['git', '-C', str(ROOT), 'ls-files', '-z']).decode().split('\0')
for relative in sorted(filter(None, tracked)):
    path = ROOT / relative
    data = path.read_bytes()
    files.append(dict(path=relative, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                      disposition='pending_mapping', evidence='static_inventory'))
    if path.suffix == '.py':
        try:
            tree = ast.parse(data.decode('utf-8-sig'), filename=relative)
            def visit(node, parents=()):
                for child in ast.iter_child_nodes(node):
                    if isinstance(child, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                        name = '.'.join((*parents, child.name))
                        symbols.append(dict(path=relative, line=child.lineno, symbol=name,
                                            kind=type(child).__name__, status='not_validated'))
                        visit(child, (*parents, child.name))
                    else:
                        visit(child, parents)
            visit(tree)
        except (SyntaxError, UnicodeError) as exc:
            errors.append({'path': relative, 'error': str(exc)})
    if relative.startswith('spectroview/resources/user_manual/') and path.suffix == '.md':
        for number, line in enumerate(data.decode('utf-8-sig').splitlines(), 1):
            if line.startswith('#'):
                headings.append(dict(path=relative, line=number, heading=line.lstrip('# ').strip(),
                                     feature_id='', status='pending_mapping'))

write_csv('upstream-files.csv', files, ['path', 'bytes', 'sha256', 'disposition', 'evidence'])
write_csv('upstream-symbols.csv', symbols, ['path', 'line', 'symbol', 'kind', 'status'])
write_csv('manual-coverage.csv', headings, ['path', 'line', 'heading', 'feature_id', 'status'])
summary = dict(commit=subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']).decode().strip(),
               files=len(files), python_symbols=len(symbols), manual_headings=len(headings), parse_errors=errors)
(HERE / 'inventory-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, indent=2))
