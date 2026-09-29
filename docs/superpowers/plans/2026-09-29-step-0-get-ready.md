# Step 0: Get Ready — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub runs appv3's automated tests on every push, and the VPS serves appv3 over HTTPS with `docker compose`.

**Architecture:**
- Move the CI workflow to where GitHub reads it, fixing its paths.
- Harden `compose.yaml` for a public server: the app port is only reachable from the VPS itself, and cookies are HTTPS-only.
- Put Caddy on the VPS in front of it, which fetches and renews the Let's Encrypt certificate by itself.
- **No separate PHP 8.4 install:** GitHub Actions (PHP 8.5) runs the backend tests, and the VPS runs the app in Docker. Between them they cover the roadmap's "a machine that can run PHP 8.4+" point.

**Tech Stack:** GitHub Actions, Docker Compose, Caddy 2, Ubuntu 24.04 LTS on the VPS, and appv3 (Laravel 13, MariaDB, React build served by nginx).

**Spec:** `docs/superpowers/specs/2026-09-29-go-live-roadmap-design.md`, step 0.

**Repos:**
- Tasks 1–2 change `LOHENDRAA/rizurf-logbook-app` (local copy `C:\Users\User\Downloads\Rizurf_Logbook\rizurf-logbook-app`), on a new branch `chore/step-0` taken from `master`.
- Tasks 3–4 are commands **the user runs on the VPS**. The agent can't reach the VPS, so it hands these over and checks the results the user reports back.

## Global Constraints

- **Placeholders the user fills in:**
  - `DOMAIN`: the logbook's web address, e.g. `logbook.rizurf.com`. Its DNS **A record** must point to the VPS's IP.
  - `VPS_IP`: the VPS's public IP.
  - `EMAIL`: the address Let's Encrypt sends expiry warnings to.
- appv3's nginx stays on host port `8080` but binds to `127.0.0.1` only. The public reaches the app only through Caddy on 80/443.
- The VPS firewall allows only SSH (22), HTTP (80) and HTTPS (443).
- Secrets (`APP_KEY` and the DB passwords) go only in `appv3/.env` on the VPS, never in git. `.env` is already git-ignored. Check with `git check-ignore appv3/.env`.
- Nothing merges to `master` or is pushed without the user saying so.

## Review Focus

1. **Backend tests in CI fail to reach the database.**
   - Cause: `phpunit.xml` sets `DB_SOCKET=/run/mysqld/mysqld.sock`, and Laravel prefers a socket over `DB_HOST`. The CI runner's MariaDB listens on TCP.
   - Expected: tests connect over TCP.
   - Task 1 sets `DB_SOCKET: ''` in the job env.
2. **Anyone on the internet reaching port 8080 directly,** over plain HTTP and past Caddy. Docker publishes ports around `ufw`.
   - Expected: only 80 and 443 answer.
   - Task 2 binds to `127.0.0.1`, and the CI compose job asserts it. Task 4 checks from outside.
3. **Session cookies sent over plain HTTP.**
   - Expected: secure cookies on the VPS.
   - Task 2 adds `SESSION_SECURE_COOKIE`; Task 4 checks the `Set-Cookie` header.
4. **The certificate not being issued** (DNS not pointing at the VPS yet, or port 80 blocked).
   - Expected: a clear error, not a silent HTTP-only site.
   - Task 3 checks DNS before starting Caddy; Task 4 checks the certificate.
5. **The container restarting with a random `APP_KEY`,** which logs everyone out on every restart.
   - Expected: the key stays stable.
   - Task 3 generates it once into `.env`; Task 4 restarts and checks it's unchanged.

---

## Task 1: CI at the repo root

**Files:**
- Create: `.github/workflows/ci.yml` (moved from `appv3/.github/workflows/ci.yml`)
- Delete: `appv3/.github/workflows/ci.yml`

**Interfaces:**
- Produces: a `ci` workflow with jobs `backend`, `frontend` and `compose`, which runs on every push and pull request. Task 2 adds a step to `compose`.

- [ ] **Step 1: Branch from master**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app
git switch master && git pull --ff-only && git switch -c chore/step-0
```

- [ ] **Step 2: Move the workflow and fix its paths**

```bash
mkdir -p .github/workflows
git mv appv3/.github/workflows/ci.yml .github/workflows/ci.yml
sed -i 's#working-directory: backend#working-directory: appv3/backend#; s#working-directory: frontend#working-directory: appv3/frontend#; s#cache-dependency-path: frontend/package-lock.json#cache-dependency-path: appv3/frontend/package-lock.json#; s#- run: docker compose config > /dev/null#- run: docker compose -f appv3/compose.yaml config > /dev/null#' .github/workflows/ci.yml
```

In the `backend` job's `env:` block, add this line under `DB_PASSWORD: root`:

```yaml
      DB_SOCKET: ''
```

Then:
- Run `grep -n "working-directory\|cache-dependency-path\|compose.yaml\|DB_SOCKET" .github/workflows/ci.yml`. Expected: every `working-directory` starts with `appv3/`, the cache path and the compose file start with `appv3/`, and `DB_SOCKET: ''` is present.
- Run `ls appv3/.github/workflows 2>/dev/null`. Expected: no output. If `appv3/.github` is now empty, git drops it on its own.

- [ ] **Step 3: Run the frontend half locally first** (catches failures before GitHub does)

```bash
cd appv3/frontend && npm ci && mkdir -p /tmp/opencode && npm run openapi:drift && npm run lint && npm run build && npm run bundle:check && npx vitest run
```

Expected: all green.
- If `openapi:drift` fails only because `/tmp/opencode` is missing on a fresh runner, add `mkdir -p /tmp/opencode && ` to the start of the `openapi:drift` script in `appv3/frontend/package.json`.
- If a real lint, test or build error shows up, it's in existing code: stop and report it to the user rather than fixing app code inside step 0.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/User/Downloads/Rizurf_Logbook/rizurf-logbook-app
git add -A .github appv3/.github appv3/frontend/package.json
git commit -m "ci: run appv3's workflow from the repo root so GitHub picks it up"
```

- [ ] **Step 5: Push the branch and read CI** (ask the user first; pushing is theirs to approve)

```bash
git push -u origin chore/step-0
gh run watch --exit-status $(gh run list --branch chore/step-0 --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: `backend`, `frontend` and `compose` all pass.
- If `backend` fails at `composer validate --strict` or Pint/PHPStan on **existing** code, report it. Those are pre-existing issues; the user decides whether to fix them now.
- A database connection error means the `DB_SOCKET` line is missing or wrong.

---

## Task 2: compose.yaml ready for a public server

**Files:**
- Modify: `appv3/compose.yaml` (the `web` service's `ports`; the `app` service's `environment`)
- Modify: `appv3/.env.example` (document the new variable)
- Modify: `.github/workflows/ci.yml` (the `compose` job asserts the bind)

**Interfaces:**
- Consumes: the `compose` CI job from Task 1.
- Produces: `SESSION_SECURE_COOKIE` (default `false`), which the VPS `.env` in Task 3 sets to `true`. Port 8080 is published on 127.0.0.1 only.

- [ ] **Step 1: Add the failing CI check**

In `.github/workflows/ci.yml`, add a second step to the `compose` job after the `config` step:

```yaml
      - name: nginx is only published on localhost (Caddy fronts it on the VPS)
        run: docker compose -f appv3/compose.yaml config | grep -q 'host_ip: 127.0.0.1'
```

- [ ] **Step 2: Watch it fail**

Run `git commit -am "ci: assert the app port is localhost-only" && git push`, then `gh run watch --exit-status $(gh run list --branch chore/step-0 --limit 1 --json databaseId -q '.[0].databaseId')`.
Expected: the `compose` job FAILS at the new step, because the port is still published on all interfaces.

- [ ] **Step 3: Bind to localhost and add the secure-cookie switch**

In `appv3/compose.yaml`, change the `web` service's port line:

```yaml
    ports:
      # Localhost only: on the VPS, Caddy terminates HTTPS and proxies here.
      - '127.0.0.1:${APP_PORT:-8080}:80'
```

In the `app` service's `environment:` block, add this after `SESSION_DRIVER: database`:

```yaml
      SESSION_SECURE_COOKIE: ${SESSION_SECURE_COOKIE:-false}
```

In `appv3/.env.example`, add this after the `APP_URL` line:

```bash

# true when served over HTTPS (the VPS); false for http://localhost.
SESSION_SECURE_COOKIE=false
```

- [ ] **Step 4: Watch it pass**

```bash
git add appv3/compose.yaml appv3/.env.example
git commit -m "chore(compose): publish the app on localhost only; secure cookies behind HTTPS"
git push
gh run watch --exit-status $(gh run list --branch chore/step-0 --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: all three jobs PASS.

---

## Task 3: Prepare the VPS (the user runs these over SSH)

**Files:** none in git. On the VPS: `/opt/rizurf-logbook-app` (a clone of the repo), `appv3/.env`, and `/etc/caddy/Caddyfile`.

**Interfaces:**
- Consumes: the `chore/step-0` branch from Tasks 1–2, and `SESSION_SECURE_COOKIE`.
- Produces: a running stack at `https://DOMAIN`.

- [ ] **Step 1: DNS points at the VPS** (run this on your own PC)

Run: `nslookup DOMAIN`
Expected: the answer shows `VPS_IP`. If it doesn't, set the domain's A record to `VPS_IP` and wait until it does. Let's Encrypt fails without it.

- [ ] **Step 2: Firewall, Docker, Caddy** (on the VPS, as a user with sudo)

```bash
sudo apt-get update && sudo apt-get -y upgrade
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # then log out and back in
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

Expected: `docker --version`, `docker compose version` and `caddy version` each print a version. `sudo ufw status` lists only OpenSSH, 80 and 443.

- [ ] **Step 3: Get the code and write `.env`**

```bash
sudo mkdir -p /opt/rizurf-logbook-app && sudo chown "$USER" /opt/rizurf-logbook-app
git clone --branch chore/step-0 https://github.com/LOHENDRAA/rizurf-logbook-app.git /opt/rizurf-logbook-app
cd /opt/rizurf-logbook-app/appv3
cp .env.example .env
```

Edit `.env` (`nano .env`) and set:

```bash
APP_URL=https://DOMAIN
SESSION_SECURE_COOKIE=true
DB_PASSWORD=<long random: openssl rand -base64 24>
DB_ROOT_PASSWORD=<another long random>
```

Then generate a stable app key into `.env`:

```bash
# --entrypoint php skips the normal boot (which would try to migrate before the DB is up).
KEY="$(docker compose run --rm --no-deps --entrypoint php app artisan key:generate --show)"
sed -i "s|^APP_KEY=.*|APP_KEY=${KEY}|" .env
grep -c '^APP_KEY=base64:' .env   # expect exactly 1
```

- [ ] **Step 4: Start the stack**

```bash
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1:8080/api/v1/health
```

Expected:
- `app`, `web` and `db` are `running`, and `db` is `healthy`.
- The health call returns JSON with a 200 status.
- `docker compose logs app | grep -i "migrat"` shows the migrations ran.

- [ ] **Step 5: Caddy in front, with HTTPS** (replace `EMAIL` and `DOMAIN` in the text below before running it)

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
{
	email EMAIL
}

DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}
EOF
sudo systemctl reload caddy
sudo journalctl -u caddy --since "2 min ago" | grep -i "certificate obtained"
```

Expected: a "certificate obtained successfully" line for `DOMAIN`. If there's an ACME error instead, recheck step 1 (DNS) and that port 80 is open.

---

## Task 4: Verify from outside (the user runs these on their own PC, then pastes the output back)

- [ ] **Step 1: HTTPS works and the app answers**

Run: `curl -sI https://DOMAIN/ | head -1` and `curl -s https://DOMAIN/api/v1/health`
Expected: `HTTP/2 200` for the page (the SPA), and the health JSON.

- [ ] **Step 2: Port 8080 is not reachable from the internet**

Run: `curl -s -m 5 http://VPS_IP:8080/ ; echo "exit=$?"`
Expected: `exit=28` (timed out) or `exit=7` (refused). **Never** an HTML page.

- [ ] **Step 3: Cookies are secure**

Run: `curl -sI https://DOMAIN/sanctum/csrf-cookie | grep -i set-cookie`
Expected: every `Set-Cookie` line contains `secure`.

- [ ] **Step 4: The key survives a restart** (on the VPS)

```bash
cd /opt/rizurf-logbook-app/appv3
docker compose restart app && sleep 5
docker compose logs app --since 1m | grep -c "generating an ephemeral key"
```

Expected: `0`. The entrypoint only prints that line when `APP_KEY` is empty.

- [ ] **Step 5: Report**

Tell the user which checks passed. Step 0 is done when:
- CI is green on `chore/step-0`;
- Task 4 steps 1–4 all pass.

Merging `chore/step-0` into `master` (through a PR) is the user's call. Once merged, switch the VPS clone to `master` with `git switch master && git pull`, then run `docker compose up -d --build`.
