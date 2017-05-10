#!/bin/sh

# Prevent newly created files from being world readable
umask 0077

BASEFILE=anarchyirc-client-key
KEYFILE=${BASEFILE}.key
CERTFILE=${BASEFILE}.crt
if [ -e "${KEYFILE}" ]; then
    echo "File ${KEYFILE} already exists. Please remove if you want to replace." >&2
    exit 1
fi
# Cannot have expire because Apache still enforces expiration even with optional_no_ca.
openssl req -x509 -days $((365*30)) -newkey rsa:4096 -keyout "${KEYFILE}" -out "${CERTFILE}" -nodes -subj /CN=unknown

echo
echo "The public certificate which needs to be installed"
echo "into the link block service is in ${CERTFILE}"
echo "and is contents are displayed here:"
echo
cat "${CERTFILE}"
echo
