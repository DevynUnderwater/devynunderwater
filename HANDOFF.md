# Handoff: hosting + editing entirely on Devyn's GitHub

Written 2026-07-25 (updated 2026-07-28: fully off Netlify). Production hosting
is GitHub Pages (built by `.github/workflows/build-deploy.yml` on every push to
`main`). Netlify is entirely removed — no `netlify.toml`, no functions; the
contact form posts to Web3Forms. Both editing surfaces (`/#edit` and `/admin`)
commit straight to GitHub with a personal access token — no Netlify Identity,
no Git Gateway.

## 1. Transfer the repo to her account — ✅ DONE 2026-07-25

Repo lives at **DevynUnderwater/devynunderwater**. The transfer preserved
Kevin's push access (collaborator, no admin), the Pages workflow source,
the custom domain setting, and the active workflow. `data/site.json`
`repo` field flipped and pushed.

Owner-only settings (Pages, Actions policies, Enforce HTTPS) are now her
taps — anything in Settings needs her device, not Kevin's.

## 2. Create her editing key (AFTER the transfer — order matters)

Fine-grained tokens only work on repos the token owner **owns**, which is why
the repo must be hers first. Logged in as her:

github.com/settings/personal-access-tokens/new
- Token name: `Site editing key`
- Expiration: **No expiration**
- Repository access: **Only select repositories** → `devynunderwater`
- Permissions → Repository → **Contents: Read and write** (Metadata adds itself)
- Generate → save the key in her password manager (and keep a copy yourself).

Where she uses it (once per device, then it's remembered):
- **/#edit** — asks for it the first time she hits Save & publish.
- **/admin** — "Sign In with Token" button.

Safari note: iPadOS clears site storage after ~7 days of not visiting.
Antidote: add the site (the /manage page) to her iPad **Home Screen**, and
she keeps the key in Notes/password manager for the rare re-paste.
GitHub also deletes tokens unused for a full year — hers gets regular use.

## 3. DNS at GoDaddy (any time after step 1.4)

Delete the parked/forwarding records on `@` and `www` first, then add:

| Type  | Host | Value |
|-------|------|-------|
| A     | @    | 185.199.108.153 |
| A     | @    | 185.199.109.153 |
| A     | @    | 185.199.110.153 |
| A     | @    | 185.199.111.153 |
| AAAA  | @    | 2606:50c0:8000::153 |
| AAAA  | @    | 2606:50c0:8001::153 |
| AAAA  | @    | 2606:50c0:8002::153 |
| AAAA  | @    | 2606:50c0:8003::153 |
| CNAME | www  | devynunderwater.github.io |

⚠️ CNAME points at `devynunderwater.github.io` (her account's Pages host) —
bare username, no repo name.

Then in repo Settings → Pages: tick **Enforce HTTPS** when the checkbox
activates (cert can take up to 24 h; usually minutes). With custom domain
www + both record sets, apex → www redirects automatically.

## 4. Loose ends

- **Contact form** posts to Web3Forms → devynunderwater@gmail.com (access key
  in `site.json` `web3formsKey`). Fully off Netlify; the old Netlify site/team
  can be deleted.
- **GH Pages doesn't read `_redirects`/`_headers`** — build.js still writes
  them; they're inert. Long-lived asset caching relies on the `?v=` hashes,
  which the build already maintains.
- **Local editing unchanged**: `node local-edit-server.mjs` + serve `site/`;
  the editor auto-detects localhost and saves to disk instead of GitHub.
- Testing hook: `localStorage.setItem('eb-branch', 'some-branch')` makes
  /#edit commit to that branch instead of main.
