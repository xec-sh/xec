#!/usr/bin/env node
// Very simple marker script - just touch a file
const fs = require('fs');
const file = process.env.MARKER_FILE || 'marker.txt';
fs.writeFileSync(file, 'marked');