
## Starting the API server

Make sure dependencies are installed:

```bash
pip install -r requirements.txt
````

Start the development server:

```bash
uvicorn app.main:app --reload
```

The API will be available at:

* [http://127.0.0.1:8000](http://127.0.0.1:8000)
* [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

