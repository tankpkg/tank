# Simple Tool

A simple, safe skill that processes JSON configuration files.

## Usage

```python
from skill import read_config, process_data, save_results

config = read_config("config.json")
results = process_data(config)
save_results(results, "output.txt")
```

## Features

- Reads JSON configuration
- Processes data
- Saves results to files
