
## Starting the Backend API server

Make sure dependencies are installed:

```bash
pip install -r ./backend/requirements.txt
````

Start the development server:

```bash
python -m backend.main
```

The API will be available at:

* [http://127.0.0.1:8080](http://127.0.0.1:8000)
* [http://127.0.0.1:8080/api/status/](http://127.0.0.1:8000/api/status/)
* [http://localhost:8080/health](http://localhost:8080/health) => will return all available endpoints

## Starting the Frontend


Install the dependencies
```bash
npm install ./frontend/
```
Run the server
```bash
npm run dev --prefix frontend
```

The Frontend will be available on [http://localhost:5173](http://localhost:5173)

