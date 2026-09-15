import main
import enhancements
import security
import uvicorn

uvicorn.run(main.app, host="127.0.0.1", port=9100)
