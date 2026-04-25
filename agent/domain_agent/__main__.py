"""python -m domain_agent [setup]"""

from __future__ import annotations

import sys


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "setup":
        from .setup_wizard import main as setup_main

        setup_main()
        return
    print(
        "Domain Agent\n"
        "  Запуск сервера: uvicorn domain_agent.main:app --host 0.0.0.0 --port 8090\n"
        "  Первичная настройка:  python -m domain_agent setup\n"
    )
    sys.exit(0 if len(sys.argv) == 1 else 2)


if __name__ == "__main__":
    main()
