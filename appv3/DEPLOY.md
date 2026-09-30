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
  - In nginx: `client_max_body_size 12m;`

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
```

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

This should return HTTP 200. Then send the developer:

- the API address (`https://api.company.com`);
- the screens' address (`https://logbook.company.com`);
- confirmation that the health check passed.

Never send the `.env` file or the database password.

## Test server (optional, before go-live)

To give the developer a test server before the logbook is finished, set `APP_ENV=staging` instead of `production`. Then load the demo accounts:

```bash
php artisan db:seed --class=PortalSeeder
```

Seeding is refused when `APP_ENV=production`, so demo accounts can never reach the live server. Before go-live, set `APP_ENV=production` and start from an empty database.

## Updating to a new version

```bash
cd /var/www/logbook
git pull
cd appv3/backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache
php artisan route:cache
```

## Backups

Back up nightly and keep at least 14 days:

- the `logbook` MySQL database, for example with `mysqldump --single-transaction logbook`;
- the `storage/app/private` folder.

Test a restore once before go-live.
