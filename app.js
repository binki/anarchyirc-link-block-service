'use strict';

const bodyParser = require('body-parser');
// Ubuntu LTS uses node-4.x which doesn’t implement Buffer.from().
const bufferFrom = require('buffer-from');
const confGeneration = require('./conf-generation');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const verror = require('verror');

const app = express();

const pathModule = path;
const VError = verror.VError;

app.use(bodyParser.urlencoded({
    extended: false,
}));

/**
 * Given PEM text string, returns a buffer of the innards. Does not
 * validate the PEM in any way. Just treats the innards as base64 so
 * that certificate files with varying line endings and
 * trailing/leading lines can be tested for equivalence.
 *
 * @param text {String} PEM-encoded certificate
 */
function bufferizePem(text) {
    const lines = text.split(/\r?\n/);
    while (lines.find(line => /^-+END CERTIFICATE/.test(line))) {
        lines.pop();
    }
    while (lines.find(line => /^-+BEGIN CERTIFICATE/.test(line))) {
        lines.shift();
    }
    const buf = bufferFrom(lines.join(''), 'base64');
    if (buf.length < 32) {
        throw new Error(`Expected PEM data to be longer than 32, got ${buf.length}`);
    }
    return buf;
}

/**
 * Given a PEM Buffer, generate a text key that can be used to
 * uniquely identify it.
 */
function keyifyPemBuffer(buf) {
    return buf.toString('base64');
}

/**
 * Given a PEM Buffer, generate an UnrealIRCd-compatible fingerprint
 * for the certificate.
 */
function fingerprintPemBuffer(buf) {
    const hash = crypto.createHash('sha256');
    hash.update(buf);
    return hash.digest('hex').replace(/(..)/g, ':$1').substring(1).toUpperCase();
}

function readFile(path, options) {
    return new Promise((resolve, reject) => fs.readFile(path, options || {}, (ex, data) => ex ? reject(ex) : resolve(data)));
}

function writeFile(path, data) {
    const dir = pathModule.dirname(path);
    const tempPath = pathModule.join(dir, `.#${pathModule.basename(path)}#`);
    // Convenience step 1: create directory if not exists.
    return new Promise((resolve, reject) => mkdirp(dir, ex => ex ? reject(ex) : resolve())).then(() => {
        // Write out to .#…# first for transactional replace.
        return new Promise((resolve, reject) => fs.writeFile(tempPath, data, ex => ex ? reject(ex) : resolve()));
    }).then(() => {
        // Rename over existing.
        return new Promise((resolve, reject) => fs.rename(tempPath, path, ex => ex ? reject(ex) : resolve()));
    });
}

let lastServerInfoPromise = null;

/**
 * Fetch the latest server information. Caches for 30 seconds.
 *
 * @param flushCache {Boolean} Throw away the cache.
 */
const getServerInfoPromise = (() => {
    let lastPromise = null;
    return function (flushCache) {
        // Cached?
        if (lastPromise && !flushCache) {
            return lastPromise;
        }

        // Schedule cache purge
        setTimeout(() => lastPromise = null, 30000);

        // Cache new.
        return lastPromise = new Promise((resolve, reject) => fs.readdir(path.join(__dirname, 'servers'), (ex, files) => ex ? reject(ex) : resolve(files))).then(files => {
            return Promise.all(files.map(file => {
                // A .crt file must exist for each. Use this to identify
                // the list of known names and go from there.
                const serverName = (/(.*)\.crt$/.exec(file) || [])[1];
                if (!serverName) {
                    return;
                }
                // Read the PEM data for the server for the sake of
                // identification.
                return readFile(path.join(__dirname, 'servers', `${serverName}.crt`), 'utf8').then(serverCertData => {
                    const serverCertBuf = bufferizePem(serverCertData);

                    // Read the JSON configuration for the server if
                    // it exists.
                    const configJsonPath = path.join(__dirname, 'servers', `${serverName}.json`);
                    return readFile(configJsonPath, 'utf8').catch(ex => {
                        // Assume optional file is just nonexistent
                        // (this assumption might be false on Windows,
                        // but shouldn’t be on unix). In that case,
                        // return default data.
                        return '{}';
                    }).then(configJsonData => {
                        try {
                            return JSON.parse(configJsonData);
                        } catch (ex) {
                            throw new VError(ex, `Unable to parse JSON from ${configJsonPath}`);
                        }
                    }).then(configJson => {
                        // Set defaults.
                        configJson = Object.assign(Object.create(null), {
                            autoconnect: true,
                            hostname: serverName,
                            port: 6697,
                        }, configJson);

                        // Load and fingerprint the stored certificate
                        // (from the data/ directory). Absence results
                        // in the server being omitted from config but
                        // still showing up in the server listing.
                        return readFile(path.join(__dirname, 'data', `${serverName}.crt`), 'utf8').then(unrealCertData => {
                            return fingerprintPemBuffer(bufferizePem(unrealCertData));
                        }, ex => null).then(unrealCertFingerprint => {

                            return {
                                autoconnect: configJson.autoconnect,
                                name: serverName,
                                hostname: configJson.hostname,
                                port: configJson.port,
                                serverCertKey: keyifyPemBuffer(serverCertBuf),
                                unrealCertFingerprint: unrealCertFingerprint,
                            };
                        });
                    });
                });
            }).filter(serverInfoPromise => serverInfoPromise));
        }).then(serverInfos => {
            return {
                byName: serverInfos.reduce((acc, value) => {
                    acc[value.name] = value;
                    return acc;
                }, Object.create(null)),
                byCertKey: serverInfos.reduce((acc, value) => {
                    acc[value.serverCertKey] = value;
                    return acc;
                }, Object.create(null)),
                names: serverInfos.map(serverInfo => serverInfo.name).sort(),
            };
        });
    };
})();

app.get('/links.conf', (req, res, next) => {
    getServerInfoPromise().then(servers => {
        const generator = confGeneration.createGenerator(req.query.syntax, res);
        servers.names.map(serverName => servers.byName[serverName]).map(server => {
            generator.write(server);
        });
        // calls res.end() for us.
        generator.end();
    }).catch(next);
});

app.post('/update', (req, res, next) => {
    getServerInfoPromise().then(servers => {
        // Get cert from request.
        const certPem = res.socket.params.SSL_CLIENT_CERT;
        if (!certPem) {
            throw new Error('You have not sent an SSL certificate. Either your client or the server is misconfigured.');
        }
        const certKey = keyifyPemBuffer(bufferizePem(certPem));
        // Look up client by their certificate.
        const server = servers.byCertKey[certKey];
        if (!server) {
            // TODO: 403
            throw new Error('You are not authorized.');
        }
        // If authorized, accept arbitrary data:
        if (!req.body.cert) {
            throw new Error('Required parameter “cert” missing.');
        }
        return writeFile(path.join(__dirname, 'data', `${server.name}.crt`), req.body.cert).then(() => {
            // Flush cache.
            getServerInfoPromise(true);
            res.end(`Updated certificate for ${server.name}`);
        });
    }).catch(next);
});

app.get('/pid', (req, res) => res.end(`${process.pid}`));

module.exports = app;
