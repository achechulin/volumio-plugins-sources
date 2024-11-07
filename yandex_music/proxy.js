'use strict';

var util = require('util');
var http = require('http');
var https = require('https');
var url = require('url');
var querystring = require('querystring');

// MPD requires 'Content-Type: audio/flac' for FLAC streams. See flac_mime_types[] at
// https://github.com/volumio/volumio-mpd/blob/master/src/decoder/plugins/FlacDecoderPlugin.cxx
// So we create proxy to change response headers from 'Content-Type: audio/mpeg'
// to 'Content-Type: audio/flac'

function Proxy(logger) {
    var self = this;

    self.logger = logger;
    self.server = false;
};

Proxy.prototype.start = function() {
    var self = this;

    if (self.server) {
        return;
    }
    self.server = http.createServer(function (req, res) {
        try {
            var query = url.parse(req.url, true);
            var req_codec = query.query['codec'];
            var req_url = query.query['url'];
            var req_url_info = url.parse(req_url);
            const options = {
                host: req_url_info.hostname,
                port: req_url_info.port,
                path: req_url_info.path,
                headers: {
                    'user-agent': 'MPD',
                    'accept': '*/*',
                },
            };
            const proxy = https.request(options, function (r) {
                if (req_codec == 'flac') {
                    r.headers['content-type'] = 'audio/flac';
                } else if (req_codec == 'aac') {
                    r.headers['content-type'] = 'audio/x-aac';
                }
                res.writeHead(r.statusCode, r.headers);
                r.pipe(res);
            });
            req.pipe(proxy);
        } catch (e) {
            res.end();
        }
    });
    self.server.listen(6601);
};

Proxy.prototype.stop = function() {
    var self = this;

    if (self.server) {
        self.server.close();
        self.server = false;
    }
};

module.exports = Proxy;
