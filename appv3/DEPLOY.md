# Deploying the Logbook API on the VPS

This guide is for whoever manages the company VPS. It deploys the logbook's **server** (a Laravel 13 app) next to the VPS's existing MySQL.

## How the pieces fit

```
Browser ──► https://logbook.company.com   Hostinger: the logbook screens (static files)
   │
   └─────► https://api.company.com        This VPS: the Laravel app (appv3/backend) ──► MySQL (same machine)
```

The domain names are placeholders. Use the real ones and tell the developer which ones you picked.

**About the "Laravel starter kit":** use it only if it sets up the server environment (PHP, Composer, the web server). Don't deploy the new empty app it creates. The app to deploy is `appv3/backend` from this repository.

## 1. Requirements

- **PHP 8.4** (required, 8.3 won't work), with these extensions: `pdo_mysql`, `mbstring`, `intl`, `zip`, `bcmath`, `xml`, `curl`, `fileinfo`, `openssl`, `tokenizer`, `ctype`.
- **Composer 2**.
- **MySQL 8**, the existing server.
- **A web server** (nginx or Apache) with **HTTPS** on `api.company.com`.
- **Upload size:** logbook templates can be up to 10 MB.
  - In PHP: `upload_max_filesize = 12M` and `post_max_size = 13M`.
  - In nginx: `client_max_body_size 14m;` (above PHP's limit, so an oversized upload reaches the app and gets its JSON error instead of the web server's HTML page).

## 2. Database

Create a database and a user that can only use it:

```sql
CREATE DATABASE logbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'logbook'@'localhost' IDENTIFIED BY '<a strong password>';
GRANT ALL PRIVILEGES ON logbook.* TO 'logbook'@'localhost';
```

MySQL doesn't need to be reachable from the internet. The app connects to it on the same machine.

## 3. Install the app

```bash
git clone https://github.com/LOHENDRAA/rizurf-logbook-app.git /var/www/logbook
cd /var/www/logbook/appv3/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
```

## 4. Configure `.env`

Edit `/var/www/logbook/appv3/backend/.env` and set these values. The file holds the database password: keep it on the server only, never commit it, and never send it by chat or email.

```ini
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.company.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=logbook
DB_USERNAME=logbook
DB_PASSWORD=<the password from step 2>

# The screens live on another subdomain of the same company domain.
FRONTEND_ORIGINS=https://logbook.company.com
SANCTUM_STATEFUL_DOMAINS=logbook.company.com
SESSION_DOMAIN=.company.com
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax

# Sign-in goes through the Rizurf gateway.
GATEWAY_URL=https://gateway.company.com      # the Rizurf gateway
PUBLIC_URL=https://logbook.company.com       # these screens, exactly as registered with the gateway

# Optional: AI summaries for browsers without Chrome's built-in AI (gpt-4o-mini, billed per use).
OPENAI_API_KEY=<the key from platform.openai.com>
```

The API refuses to start without `GATEWAY_URL` and `PUBLIC_URL`. `PUBLIC_URL` is published as the app's address in `/api/v1/openapi.json`, and the gateway sends people back there after they sign in.

`OPENAI_API_KEY` is optional. Without it, AI summaries only work in Chrome 138+ on a desktop (free, on the person's own computer). With it, other browsers get them through the server, up to 20 a day per person (`AI_SUMMARIES_PER_DAY`). The key stays in `.env`; the logbook never sends it to a browser.

Then run:

```bash
php artisan key:generate
php artisan migrate --force
php artisan config:cache
php artisan route:cache
```

## 5. Web server

- Set the document root to **`/var/www/logbook/appv3/backend/public`**. Never point it at the repository root or at `backend/`, because that would expose `.env`.
- Send every request that isn't a real file to `index.php`. Laravel's standard nginx config does this: <https://laravel.com/docs/deployment#nginx>
- Make these writable by the web server user (for example `www-data`):

```bash
chown -R www-data:www-data storage bootstrap/cache
```

Uploaded templates are stored in `storage/app/private`. Include that folder in the server's backups.

## 6. Check it works

```bash
curl https://api.company.com/api/v1/health
```

This should return HTTP 200 with `"service": "intern-logbook"` and `"status": "ok"`. If `service` shows a different name, something else is answering on that address.

Also check:

```bash
curl https://api.company.com/api/v1/openapi.json   # 200, a JSON document
curl https://api.company.com/api/v1/nonexistent    # 404 with {"error": {"code": "RESOURCE_NOT_FOUND", ...}}
```

### Connecting to the Rizurf gateway

In the gateway console, open **Conformance**, paste the base URL below, and run it. Every check must pass. Then go to **Connect a service**, paste the same URL, and ask an administrator to approve it in **Connections**.

Once it's connected, the gateway also reads `https://api.company.com/api/v1/gateway/badges` about once a minute and shows each person's count on the logbook's icon in **Your apps**: weeks waiting for a supervisor, or weeks sent back to an intern. There's nothing to set up for this. In the gateway's **App badges** page the logbook should show **Working**. Opening that address in a browser must answer 401 (JSON), not 404.

```
SERVICE READY

  Base URL     https://api.company.com/api/v1
  Service id   intern-logbook
  Domain       Human Resources
  Owner        intern-logbook-team
  Endpoints    27
  Start it     already running under the web server (section 5)
```

Send the developer:

- the API address (`https://api.company.com`);
- the screens' address (`https://logbook.company.com`);
- the conformance result (a screenshot, or the list of failed rules if any).

Never send the `.env` file or the database password.

## 7. Who may use the logbook

Everyone signs in through the Rizurf gateway; the logbook stores no passwords. It only needs to know who is an intern and who is a supervisor, and at which company:

```bash
php artisan logbook:user sarah.lim@company.com "Sarah Lim" supervisor --company="Company Sdn Bhd"
php artisan logbook:user aisha@student.edu "Aisha Rahman" student
```

The email must be the one the person uses at the gateway. Run the command again to change someone's role. Someone who isn't added sees "…isn't set up in the logbook yet".

## Test server (optional, before go-live)

To give the developer a test server before the logbook is finished, set `APP_ENV=staging` instead of `production`. Then load the demo accounts:

```bash
php artisan db:seed --class=PortalSeeder
```

Seeding is refused when `APP_ENV=production`, so demo accounts can never reach the live server. Before go-live, set `APP_ENV=production` and start from an empty database.

The test server needs its own gateway registration. To test the screens from a PC (the README's dev proxy), set its `PUBLIC_URL=http://localhost:5173/intern-logbook`. The seeded demo people can only sign in if the gateway has accounts with the same emails, so add real test accounts with `logbook:user`.

## Updating to a new version

Updating to the version with gateway sign-in signs everyone out once (the session cookie is renamed), and it needs `GATEWAY_URL` and `PUBLIC_URL` in `.env` first.

```bash
cd /var/www/logbook
git pull
cd appv3/backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
```

## Scheduled jobs

The app clears old idempotency keys once a day through Laravel's scheduler. Add this cron entry for the web server user:

```bash
echo '* * * * * www-data cd /var/www/logbook/appv3/backend && php artisan schedule:run >> /dev/null 2>&1' | sudo tee /etc/cron.d/logbook-scheduler
```

## Backups

Every night, back up the `logbook` database and the uploaded templates (`storage/app/private`), and keep 14 days.

1. Give the backup its own read-only database login, so the script holds no password:

```sql
CREATE USER 'logbook_backup'@'localhost' IDENTIFIED BY '<another strong password>';
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON logbook.* TO 'logbook_backup'@'localhost';
```

```bash
sudo sh -c 'printf "[client]\nuser=logbook_backup\npassword=<that password>\n" > /root/.logbook-backup.cnf && chmod 600 /root/.logbook-backup.cnf'
```

2. Save this as `/usr/local/bin/logbook-backup`, then run `sudo chmod 700 /usr/local/bin/logbook-backup`:

```sh
#!/bin/sh
# Nightly logbook backup: the database and the uploaded templates, kept 14 days.
set -eu
DIR=/var/backups/logbook
STAMP=$(date +%F)
mkdir -p "$DIR"
chmod 700 "$DIR"
# No pipe into gzip: a failed dump must stop the script before old backups are deleted.
mysqldump --defaults-extra-file=/root/.logbook-backup.cnf --single-transaction --routines --no-tablespaces logbook > "$DIR/db-$STAMP.sql" \
  || { rm -f "$DIR/db-$STAMP.sql"; exit 1; }
gzip -f "$DIR/db-$STAMP.sql"
tar -czf "$DIR/files-$STAMP.tar.gz" -C /var/www/logbook/appv3/backend/storage/app private
find "$DIR" -type f -name '*.gz' -mtime +14 -delete
```

3. Run it at 02:30 every night:

```bash
echo '30 2 * * * root /usr/local/bin/logbook-backup' | sudo tee /etc/cron.d/logbook-backup
```

Run it once by hand (`sudo /usr/local/bin/logbook-backup`) and check that `sudo ls -l /var/backups/logbook` shows today's two files. The folder is readable by root only, so every command that touches it needs `sudo`.

These backups sit on the same VPS. If the company already copies the server's disks somewhere else, include `/var/backups/logbook`. If not, copy that folder off the machine regularly.

### Test a restore (once, before go-live)

Restore into a scratch database, never over `logbook`:

```bash
DB=$(sudo sh -c 'ls -t /var/backups/logbook/db-*.sql.gz | head -1')
FILES=$(sudo sh -c 'ls -t /var/backups/logbook/files-*.tar.gz | head -1')
sudo mysql -e "CREATE DATABASE logbook_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
sudo gunzip -c "$DB" | sudo mysql logbook_restore_test
sudo mysql -e "SELECT COUNT(*) AS restored_weeks FROM logbook_restore_test.weeks; SELECT COUNT(*) AS live_weeks FROM logbook.weeks"
sudo tar -tzf "$FILES" | head
sudo mysql -e "DROP DATABASE logbook_restore_test"
```

This uses the newest backup. The restore worked when:
- `restored_weeks` isn't 0, and is the same as `live_weeks` or a little lower (weeks are added as people open them, so the live count can have grown since the backup);
- the file list shows the templates under `private/`.

Tell the developer the restore test passed.
