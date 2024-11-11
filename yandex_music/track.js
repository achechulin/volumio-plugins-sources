'use strict';

var libQ = require('kew');
var axios = require("axios");
var crypto = require("crypto");
var querystring = require('querystring');
var util = require('util');

// Prefer MP3 320 kbps instead of AAC 256 kbps
// (only in High Quality mode)
const PREFER_MP3 = true;
// Prefer proxy for MP3 playback to avoid
// curl/GnuTLS error in Volumio 2
const PREFER_PROXY = true;

function getTrackV1(client, track_id, logger) {
    var defer = libQ.defer();

    var ids = track_id.split('@');
    track_id = ids[0];

    client.tracks.getDownloadInfo(track_id).then(function (resp) {
        var filtered = resp.result.filter(function (x) { return x.codec == 'mp3' && !x.preview; });
        var sort_fn = function (a, b) {
            return b.bitrateInKbps - a.bitrateInKbps; 
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

function getTrackV2(client, track_id, logger) {
    var defer = libQ.defer();

    var ids = track_id.split('@');
    ids = ids[0].split(':');
    track_id = ids[0];

    var now = new Date().getTime();
    var m = (PREFER_MP3) ? `${now}${track_id}losslessflacmp3raw` : `${now}${track_id}losslessflacaache-aacmp3raw`;
    var s = crypto.createHmac('sha256', 'kzqU4XhfCaY6B6JTHODeq5').update(m).digest("base64");
    s = s.replace('=', '');
    var params = {
        'ts': now,
        'trackId': track_id,
        'quality': 'lossless',
        'codecs': (PREFER_MP3) ? 'flac,mp3' : 'flac,aac,he-aac,mp3',
        'transports': 'raw',
        'sign': s,
    };
    client.request.request({
        method: 'GET',
        url: '/get-file-info',
        query: params,
    }).then(function (resp) {
        var info = resp.result.downloadInfo;
        var url;
        if (info.codec == 'flac' || info.codec == 'aac' || PREFER_PROXY) {
            // MPD requires proper Content-Type header for FLAC decoding,
            // so we are using local proxy to change headers.
            // Also faad, default decoder for AAC, fails with
            // error decoding AAC stream, so we are using local proxy
            // to switch to ffmpeg decoder.
            // And .flac file extension added to url so that the UI can show FLAC icon.
            // But .aac file extension selects faad decoder, and will lead to error.
            url = 'http://localhost:6601/?' + querystring.stringify({
                'codec': info.codec,
                'url': info.url,
                'ext': (info.codec == 'flac' || info.codec == 'mp3') ? '.' + info.codec : '',
            });
        } else {
            // MP3 plays directly, and UI show MP3 icon.
            url = info.url;
        }
        defer.resolve({'uri': url, 'codec': info.codec, 'bitrate': info.bitrate});
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
};

function getTrackUrl(client, track_id, hq, logger) {
    if (hq) {
        return getTrackV2(client, track_id, logger);
    } else {
        return getTrackV1(client, track_id, logger);
    }
};

module.exports = getTrackUrl;
