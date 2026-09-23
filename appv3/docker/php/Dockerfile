# Laravel API (php-fpm). Build context is the monorepo root.
FROM php:8.5-fpm

# System libraries for the required PHP extensions.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        unzip \
        libicu-dev \
        libzip-dev \
    # NOTE: opcache is already compiled into php:8.5-fpm (shows in `php -m`);
    # installing it shared via docker-php-ext-install fails on PHP 8.5, so it is
    # intentionally omitted here.
    && docker-php-ext-install -j"$(nproc)" pdo_mysql bcmath intl zip pcntl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Install PHP dependencies first for better layer caching.
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-interaction --no-scripts --no-autoloader --prefer-dist

# Application code + container entrypoint.
COPY backend/ .
COPY docker/php/entrypoint.sh /usr/local/bin/logbook-entrypoint.sh
RUN chmod +x /usr/local/bin/logbook-entrypoint.sh \
    && composer dump-autoload --optimize --no-interaction \
    && php artisan package:discover --ansi \
    && mkdir -p storage/framework/sessions storage/framework/views storage/framework/cache bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000

ENTRYPOINT ["/usr/local/bin/logbook-entrypoint.sh"]
CMD ["php-fpm"]
