# demo-notebook

A Jupyter notebook for exploring and running the `demo-recorder` with `browser-use`.

## Setup

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create env file
cp .env.example .env
# Fill in your API keys in .env

# Run the notebook (uv handles the venv automatically)
uv run jupyter lab
```

## Running a specific notebook

```bash
uv run jupyter notebook demo.ipynb
```
