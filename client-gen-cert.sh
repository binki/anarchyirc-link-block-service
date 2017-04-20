#!/bin/sh

# Prevent newly created files from being world readable
umask 0077

KEYFILE=anarchyirc-client-key.key
if [ -e "${KEYFILE}" ]; then
    echo "File ${KEYFILE} already exists. Please remove if you want to replace." >&2
    exit 1
fi
# Cannot have expire because Apache still enforces expiration even with optional_no_ca.
openssl req -x509 -days $((365*30)) -newkey rsa:4096 -keyout "${KEYFILE}" -out anarchyirc-client-key.crt -nodes -subj /CN=unknown
