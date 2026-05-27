# Brain Spa Chess Harness

The chess example uses FEN as the current input contract. Image input is handled as an image-to-FEN stage before legal move and explanation scoring.

Run the harness through the API:

```bash
curl -s http://127.0.0.1:8000/api/overview
```

Then use `/api/evals/run` with `environment_key` set to `chess`.

