# xeloc_news

xeloc app news delivery data and local CMS.

## Data Flow

`source/*.json` is the editable CMS source of truth.

The app reads generated delivery files under each language directory:

```text
ja/index.json
ja/all.json
ja/1.json
ja/latest_num.json

en/index.json
en/all.json
en/1.json
en/latest_num.json
```

`latest_num.json` is kept for backward compatibility. New app implementations should prefer
`index.json`.

## Local CMS

Start the CMS:

```bash
cd cms
npm start
```

Open:

```text
http://localhost:4177
```

The CMS can:

- edit `source/ja.json` and `source/en.json`
- generate delivery JSON files
- stage and commit `source`, `ja`, and `en`
- optionally push after commit

## macOS Apache Local Domain

If you want to open the CMS through macOS Apache, use Apache for the UI and keep
the Node server for file writes, generation, and Git operations.

Do not set `cms` as a static document root. Use `cms/public` as the document root
and proxy `/api/` to the Node server.

1. Start the API server:

```bash
cd /Users/kentacky/DXL-Labs/xeloc-news/cms
npm start
```

2. Copy the example virtual host:

```bash
sudo cp /Users/kentacky/DXL-Labs/xeloc-news/cms/apache/xeloc-news-cms.conf.example /etc/apache2/other/xeloc-news-cms.conf
```

3. Make sure these modules are enabled in `/etc/apache2/httpd.conf`:

```apache
LoadModule proxy_module libexec/apache2/mod_proxy.so
LoadModule proxy_http_module libexec/apache2/mod_proxy_http.so
```

4. Add a local host name:

```bash
sudo sh -c 'echo "127.0.0.1 xeloc-news-cms.local" >> /etc/hosts'
```

5. Restart Apache:

```bash
sudo apachectl configtest
sudo apachectl restart
```

Then open:

```text
http://xeloc-news-cms.local
```

## Generate Without CMS

```bash
cd cms
npm run generate
```

## File Roles

- `source/*.json`: CMS-managed source data, including draft status and internal notes
- `{lang}/index.json`: lightweight app update metadata
- `{lang}/all.json`: initial full fetch payload
- `{lang}/{num}.json`: differential fetch payload
- `{lang}/latest_num.json`: legacy latest number payload
