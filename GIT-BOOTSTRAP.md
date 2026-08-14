# Git Bootstrap — qagent-catalog

## First repository setup

Create an empty remote repository named:

```text
qagent-catalog
```

From the extracted project root:

```bash
git init
git branch -M main
git add .
git commit -m "feat: foundation 07.5.1 qagent catalog"
git remote add origin <YOUR_QAGENT_CATALOG_GIT_URL>
git push -u origin main
```

After real environment validation:

```bash
git tag foundation-07.5.1
git push origin foundation-07.5.1
```

## ZIP replacement rule

Future ZIPs never contain `.git/`.

When replacing the local snapshot, preserve:

```text
qagent-catalog/.git/
```

Replace project files only, then run:

```bash
npm ci
npm run check
git status
git diff
```

Commit only after reviewing the delta.

## Never version

- `node_modules/`;
- `.wrangler/`;
- `.dev.vars`;
- `.env*`;
- secrets;
- generated coverage;
- `.git/` inside snapshots.
