#!/bin/sh
set -eu
# psql reads the password from its environment, never a process argument.
APP_DB_PASSWORD="$(cat /run/secrets/db_password)"
export APP_DB_PASSWORD
psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres <<'SQL'
\getenv app_user APP_DB_USER
\getenv app_db APP_DB_NAME
\getenv app_password APP_DB_PASSWORD
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
CREATE DATABASE :"app_db" OWNER :"app_user" TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE :"app_db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"app_db" TO :"app_user";
SQL
unset APP_DB_PASSWORD
