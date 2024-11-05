'use strict';

var libQ = require('kew');
var axios = require("axios");
var crypto = require("crypto");
var util = require('util');

function getTrackUrl(client, track_id, hq, logger) {
    var defer = libQ.defer();

    var ids = track_id.split('@');
    track_id = ids[0];

    client.tracks.getDownloadInfo(track_id).then(function (resp) {
        var filtered = resp.result.filter(function (x) { return x.codec == 'mp3' && !x.preview; });
        var sort_fn = function (a, b) {
            if (hq) {
                return b.bitrateInKbps - a.bitrateInKbps; 
            } else {
                return a.bitrateInKbps - b.bitrateInKbps; 
            }
        };
        var sorted = filtered.sort(sort_fn);
        var codec = sorted[0].codec;
        var bitrate = sorted[0].bitrateInKbps;
        axios.get(''.concat(sorted[0].downloadInfoUrl, '&format=json'), {
            headers: client.request.config.HEADERS
        }).then(function (resp) {
            var info = resp.data;
            var trackUrl = 'XGRlBW9FXlekgbPrRHuSiA'.concat(info.path.substr(1)).concat(info.s);
            var hashedUrl = crypto.createHash('md5').update(trackUrl).digest('hex');
            var uri = 'https://'.concat(info.host, '/get-mp3/').concat(hashedUrl, '/').concat(info.ts).concat(info.path);
            defer.resolve({'uri': uri, 'codec': codec, 'bitrate': bitrate});
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
};

module.exports = getTrackUrl;
