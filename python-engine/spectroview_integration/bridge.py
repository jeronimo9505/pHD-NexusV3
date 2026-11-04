"""Launch the isolated installed engine without changing Nexus dependencies."""
import json
import os
from pathlib import Path
import subprocess


ENGINE_ROOT = Path(__file__).resolve().parents[1]


def interpreter():
    configured = os.environ.get('PHDNEXUS_SPECTROVIEW_PYTHON')
    path = Path(configured) if configured else ENGINE_ROOT.parent / 'SPECTROview' / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not path.is_file():
        raise RuntimeError('SPECTROview environment is unavailable. Configure PHDNEXUS_SPECTROVIEW_PYTHON.')
    return str(path.resolve())


def command(operation, vault=None, source=None, run_id=None):
    args = [interpreter(), '-m', 'spectroview_integration', operation]
    for key, value in (('--vault', vault), ('--source', source), ('--run-id', run_id)):
        if value is not None:
            args.extend([key, str(value)])
    return args


def invoke(operation, *, vault=None, source=None, spec=None, run_id=None):
    args = command(operation, vault, source, run_id)
    if spec is not None:
        args.extend(['--spec', '-'])
    result = subprocess.run(args, input=json.dumps(spec) if spec is not None else None,
                            text=True, encoding='utf-8', capture_output=True, cwd=ENGINE_ROOT,
                            timeout=120, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode:
        lines = result.stderr.strip().splitlines()
        raise ValueError(lines[-1] if lines else 'Isolated engine failed')
    return json.loads(result.stdout)


def launch(vault, run_id, path):
    args = command('resume', vault=vault, run_id=run_id)
    with (path / 'worker-output.txt').open('ab') as output:
        return subprocess.Popen(args, cwd=ENGINE_ROOT, stdin=subprocess.DEVNULL,
                                stdout=output, stderr=output,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
