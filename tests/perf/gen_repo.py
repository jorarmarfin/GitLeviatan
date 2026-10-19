#!/usr/bin/env python3
"""Genera un repositorio sintético con historial ramificado para medir rendimiento.

Uso: tests/perf/gen_repo.py <directorio> <n_commits>

Cada 10 commits de `main` hay un merge de una rama lateral (`side`) creada 5 commits
antes, así que el grafo tiene merges y carriles reales. Usa `git fast-import`:
100 000 commits se generan en pocos segundos.
"""
import subprocess
import sys
from pathlib import Path


def stream(total: int):
    ts = 1_700_000_000
    ident = "Perf <perf@example.com>"
    main_mark = None
    side_mark = None
    mark = 0

    def commit(ref: str, subject: str, parents: list[int]) -> int:
        nonlocal mark, ts
        mark += 1
        ts += 60
        out = [
            f"commit {ref}\n",
            f"mark :{mark}\n",
            f"author {ident} {ts} +0000\n",
            f"committer {ident} {ts} +0000\n",
            f"data {len(subject.encode())}\n{subject}\n",
        ]
        if parents:
            out.append(f"from :{parents[0]}\n")
            for extra in parents[1:]:
                out.append(f"merge :{extra}\n")
        out.append("\n")
        sys.stdout.write("".join(out))
        return mark

    for i in range(1, total + 1):
        if i % 10 == 5 and main_mark is not None:
            side_mark = commit("refs/heads/side", f"side {i}", [main_mark])
        if i % 10 == 0 and side_mark is not None:
            main_mark = commit("refs/heads/main", f"merge {i}", [main_mark, side_mark])
            side_mark = None
        else:
            main_mark = commit("refs/heads/main", f"commit {i}", [main_mark] if main_mark else [])
    sys.stdout.write("reset refs/heads/main\nfrom :%d\n" % main_mark)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    target, total = Path(sys.argv[1]), int(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q", "-b", "main", str(target)], check=True)
    proc = subprocess.Popen(
        ["git", "fast-import", "--quiet"], cwd=target, stdin=subprocess.PIPE, text=True
    )
    sys.stdout = proc.stdin  # type: ignore[assignment]
    stream(total)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("git fast-import falló")
    sys.stdout = sys.__stdout__
    subprocess.run(["git", "checkout", "-q", "-f", "main"], cwd=target, check=True)
    count = subprocess.run(
        ["git", "rev-list", "--all", "--count"], cwd=target, capture_output=True, text=True
    ).stdout.strip()
    print(f"{target}: {count} commits")


if __name__ == "__main__":
    main()
