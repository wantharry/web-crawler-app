# Web Crawler App

A small Node.js CLI app that crawls web pages and writes extracted data to a JSON file.

## Features

- Crawl from one or more start URLs
- Follow links up to a configurable depth
- Optional same-origin restriction
- Save crawl output to a file
- Write extracted page text and discovered links (not only metadata)

## Usage

```bash
cd /home/openclaw/projects/web-crawler-app
node crawl.js --start https://example.com --depth 1 --max-pages 20 --out output.json
```

Use a URL input file:

```bash
node crawl.js --input urls.txt --depth 1 --max-pages 50 --out output.json

Limit extracted text size per page:

```bash
node crawl.js --start https://example.com --text-chars 50000 --out output.json
```
```

Example `urls.txt`:

```text
https://example.com
https://developer.mozilla.org
```

## Output shape

Each page record includes:

- `url`, `depth`, `status`, `title`
- `text`: extracted page text (up to `--text-chars`)
- `textSnippet`: first 1000 characters quick preview
- `links`: discovered page links
- `linkCount`, `crawledAt`
