'use strict';

const generators = new Map();

module.exports.getGeneratorNames = function () {
    return Array.from(generators.keys());
}

/**
 * Create a generator. Stream-like (write(server), end()) but for now
 * you have to provide the destination as parameter out here. In
 * future maybe will be stream and use pipe(). The future is tomorrow.
 */
module.exports.createGenerator = function (name, out) {
    if (!name) {
        name = 'unrealircd4';
    }
    const generator = generators.get(name);
    if (!generator) {
        throw new Error(`Unknown generator ${name}`);
    }
    return new generator(out);
}

function unrealircdHeadComment(out, extra) {
    out.setHeader('Content-Type', 'text/plain; charset=utf-8');
    out.write('/*\n');
    out.write(' * anarchyirc © binki 2017.\n');
    out.write(' * Work in progress.\n');
    out.write(' * https://github.com/binki/anarchyirc-link-block-service\n');
    out.write(extra || '');
    out.write(' */\n');
}

function unrealircdOmittedComment(out, server) {
    out.write(`/* Omitting ${server.name}: no unrealircd certificate specified. */\n`);
}

generators.set('json', function (out) {
    out.setHeader('Content-Type', 'application/json; charset=utf-8');

    var o = Object.create(null);

    this.write = function (server) {
        // Do not do something like just handing the server object
        // directly over. Only explicitly written properties should go
        // out (i.e., this is a whitelist) in case we ever add
        // sensitive data to the server object.
        o[server.name] = {
            autoconnect: server.autoconnect,
            hostname: server.hostname,
            port: server.port,
            unrealCertFingerprint: server.unrealCertFingerprint,
        };
    };

    this.end = function () {
        out.end(JSON.stringify(o));
    };
});

generators.set('unrealircd4', function (out) {
    unrealircdHeadComment(out, ' * syntax=unrealircd4\n');

    this.write = function (server) {
        if (!server.unrealCertFingerprint) {
            unrealircdOmittedComment(out, server);
            return;
        }
        out.write(`link ${server.name} {
  incoming {
    mask *;
  };
  outgoing {
    hostname "${server.hostname}";
    port ${server.port};
    options {${['autoconnect'].filter(option => server[option]).map(option => `\n      ${option};`).join('')}
      ssl;
    };
  };
  password "${server.unrealCertFingerprint}" { ssclientcertfp; };
  hub *;
  class servers;
};

`);
    }

    this.end = function () {
        out.end('/* end */\n');
    }
});

generators.set('unrealircd3', function (out) {
    unrealircdHeadComment(out, ' * syntax=unrealircd3\n');

    this.write = function (server) {
        if (!server.unrealCertFingerprint) {
            unrealircdOmittedComment(out, server);
            return;
        }
        out.write(`link ${server.name} {
  username *;
  hostname "${server.hostname}";
  bind-ip *;
  port ${server.port};
  password-connect *;
  password-receive "${server.unrealCertFingerprint}" { sslclientcertfp; };
  class servers; /* necessary? you might need to just stub the class definition into your unrealircd.conf */
  options {${['autoconnect'].filter(option => server[option]).map(option => `\n    ${option};`).join('')}
    ssl;
    /* I don’t think requiring this really helps in most cases. */
    nohostcheck;
  };
  hub *;
};

`);
    };

    this.end = function () {
        out.end('/* end */\n');
    };
});
