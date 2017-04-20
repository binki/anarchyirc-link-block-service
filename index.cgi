#!/usr/bin/env node
'use strict';

const app = require('./app');
const expressAutoserve = require('express-autoserve');

expressAutoserve(app);
