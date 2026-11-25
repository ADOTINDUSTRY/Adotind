FROM node:24-bookworm-slim AS neon-runtime
FROM php:8.4-apache-bookworm
COPY --from=neon-runtime /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
    && apt-get install -y --no-install-recommends libjpeg62-turbo-dev libpng-dev libwebp-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" gd \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod rewrite headers expires deflate \
    && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"
WORKDIR /var/www/html
COPY index.php .htaccess robots.txt sitemap.xml favicon.ico ./
COPY app/ ./app/
COPY public/ ./public/
COPY bluehost-site.conf /etc/apache2/sites-available/000-default.conf
RUN node app/cli/neon-library.cjs
RUN sed -i 's|https://adotind.com|https://adotind.cy|g' robots.txt sitemap.xml \
    && chmod 0644 index.php .htaccess robots.txt sitemap.xml /etc/apache2/sites-available/000-default.conf \
    && chmod -R a+rX app public \
    && chown root:root /var/www/html && chmod 0755 /var/www/html \
    && install -d -o www-data -g www-data -m 0750 /var/www/adotind-media \
    && printf 'expose_php=Off\nsession.use_strict_mode=1\nsession.cookie_httponly=1\nsession.cookie_secure=1\nsession.cookie_samesite=Lax\n' > "$PHP_INI_DIR/conf.d/zz-website.ini" \
    && php -r 'exit(extension_loaded("pdo_sqlite") && extension_loaded("gd") ? 0 : 1);' \
    && find app -name '*.php' -type f -print0 | xargs -0 -r -n1 php -l >/dev/null
RUN php -l index.php && apache2ctl configtest && node --version \
    && php -r 'file_put_contents("public/site-build.txt", bin2hex(random_bytes(16)));'
ENV ADOTIND_PUBLIC_URL=https://adotind.cy
RUN printf 'session.save_path=/var/www/adotind-media/private-sessions\nsession.gc_probability=1\nsession.gc_divisor=100\n' > "$PHP_INI_DIR/conf.d/zz-session-storage.ini"
CMD ["sh", "-c", "set -e; install -d -m 0700 -o www-data -g www-data /var/www/adotind-media/private-sessions; if [ -d /var/www/site-tracking ]; then runuser -u www-data -- php app/cli/publish-neon-library.php; fi; exec apache2-foreground"]
EXPOSE 80
