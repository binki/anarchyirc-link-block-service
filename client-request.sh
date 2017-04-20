#!/bin/sh
if ! [ -e "${1}" ]; then
    echo "Usage: ${0} /path/to/new/certificate.pem" >&2
    exit 1
fi
curl --cert anarchyirc-client-key.crt --key anarchyirc-client-key.key --data-urlencode cert@"${1}" https://sam.ohnopub.net/~binki/irc-poc/index.cgi/update
