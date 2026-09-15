import main
import enhancements
import uvicorn

uvicorn.run(main.app, host="127.0.0.1", port=9100)
