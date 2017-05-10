#!/bin/sh
if ! [ -e "${2}" ]; then
    echo "Usage: ${0} https://example.org/endpoint /path/to/new/certificate.pem" >&2
    exit 1
fi
curl --cert anarchyirc-client-key.crt --key anarchyirc-client-key.key --data-urlencode cert@"${2}" "${1}"/update
