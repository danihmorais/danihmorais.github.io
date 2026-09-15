import main

TARGET_PATH = "/api/emprestimos/{emprestimo_id}/devolver"

for route in list(main.app.router.routes):
    if getattr(route, "path", None) == TARGET_PATH and "POST" in (getattr(route, "methods", None) or set()):
        main.app.router.routes.remove(route)

import enhancements
import exemplares
