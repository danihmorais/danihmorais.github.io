import main
main.init_db()
import route_fix
import security
import uvicorn

uvicorn.run(route_fix.main.app, host="127.0.0.1", port=9100)
