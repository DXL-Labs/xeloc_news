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


## Environments

The CMS supports two delivery environments from one UI.

```text
Development
  branch: develop
  delivery URL: https://dev.news.xeloc.dxl-labs.dev/

Production
  branch: main
  delivery URL: https://news.xeloc.dxl-labs.dev/
```

Use the Environment switcher in the CMS header to change the current Git branch.
The CMS blocks switching when there are local uncommitted changes. Save, commit, or discard changes
before switching environments.

First-time development setup:

```bash
git switch -c develop
git push -u origin develop
git switch main
```

After the branch exists, the CMS can switch between `main` and `develop`.

Recommended flow:

```text
1. Switch to Development
2. Edit news
3. Save
4. Commit + Push
5. Confirm https://dev.news.xeloc.dxl-labs.dev/
6. Switch to Production
7. Apply or merge the confirmed change to main
8. Commit + Push
9. Confirm https://news.xeloc.dxl-labs.dev/
```

## Cloudflare Pages Domains

Recommended Cloudflare setup is two Pages projects connected to the same GitHub repository.

```text
xeloc-news-dev
  Production branch: develop
  Custom domain: dev.news.xeloc.dxl-labs.dev

xeloc-news-prod
  Production branch: main
  Custom domain: news.xeloc.dxl-labs.dev
```

Cloudflare Pages setup:

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Create a Pages project from the GitHub repository.
4. For the production project, set the production branch to `main`.
5. For the development project, create another Pages project and set the production branch to `develop`.
6. Build settings can be left empty for this static JSON repository.
7. Add custom domains:
   - `news.xeloc.dxl-labs.dev` to the production Pages project
   - `dev.news.xeloc.dxl-labs.dev` to the development Pages project
8. Cloudflare will create the required DNS records automatically if the zone is managed in Cloudflare.

If the DNS records are created manually, use CNAME records:

```text
news      CNAME  <production-pages-project>.pages.dev
dev.news  CNAME  <development-pages-project>.pages.dev
```

In the Cloudflare DNS UI, the second record is usually entered as:

```text
Type: CNAME
Name: dev.news
Target: <development-pages-project>.pages.dev
Proxy status: Proxied
```

The production record is:

```text
Type: CNAME
Name: news
Target: <production-pages-project>.pages.dev
Proxy status: Proxied
```
