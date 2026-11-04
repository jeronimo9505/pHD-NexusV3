"""Isolated worker CLI; does not start a GUI or the Nexus server."""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['capabilities', 'inspect', 'create', 'resume', 'preview', 'preview-selection'])
    parser.add_argument('--vault')
    parser.add_argument('--source')
    parser.add_argument('--spec')
    parser.add_argument('--run-id')
    parser.add_argument('--block-size', type=int, default=128)
    args = parser.parse_args()
    if args.operation == 'capabilities':
        from .engine import capabilities
        result = capabilities()
    elif args.operation == 'inspect':
        from .dataset import NexusDataset
        result = NexusDataset(args.vault, args.source).describe(include_hash=True)
    elif args.operation in ('preview', 'preview-selection'):
        from .preview import preview, preview_selection
        operation = preview if args.operation == 'preview' else preview_selection
        result = operation(args.vault, args.source, json.load(sys.stdin))
    else:
        from .runs import create_run, execute_run
        if args.operation == 'create':
            if args.spec == '-':
                spec = json.load(sys.stdin)
            else:
                with open(args.spec, encoding='utf-8') as stream:
                    spec = json.load(stream)
            result = create_run(args.vault, args.source, spec, args.block_size)
        else:
            from .runs import run_directory
            cancellation = run_directory(args.vault, args.run_id) / 'cancel.request'
            result = execute_run(args.vault, args.run_id, cancel_check=cancellation.exists)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == '__main__':
    main()
