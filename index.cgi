#!/usr/bin/env node
'use strict';

const app = require('./app');
const expressAutoserve = require('express-autoserve');
const chokidar = require('chokidar');
const path = require('path');

expressAutoserve(app);

function exit() {
    console.warn('restart requested');
    process.exit(0);
}
chokidar.watch(path.resolve(__dirname, 'data', 'updated'))
    .on('change', exit)
;
