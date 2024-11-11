'use strict';

var libQ = require('kew');
var util = require('util');

function Playlist(client, user_id, playlist_id, type, logger) {
    var self = this;

    self.client = client;
    self.user_id = user_id;
    self.playlist_id = playlist_id;
    self.type = type;
    self.logger = logger;
    self.title = '';
    self.tracks = [];
    self.batch_id = 0;
    self.new_tracks = [];
};

function getCoverUri(uriTemplate, size) {
    if (uriTemplate) {
        return `https://${uriTemplate.replace('%%', `${size}x${size}`)}`;
    } else {
        return '/albumart?sourceicon=music_service/yandex_music/icons/track.png';
    }
}

Playlist.prototype.trackToSong = function(track, album, artist, playlist_id) {
    var alb = album ? album : (track.albums[0] ? track.albums[0] : false);
    var art = artist ? artist : (track.artists[0] ? track.artists[0] : false);
    var id = alb ? (track.id + ':' + alb.id) : track.id;
    if (playlist_id) {
        id = id + '@' + playlist_id;
    }
    return {
        id: id,
        service: 'yandex_music',
        type: 'song',
        name: track.title,
        title: track.title,
        album: alb ? alb.title : '',
        artist: art ? art.name : '',
        duration: Math.round(track.durationMs / 1000),
        albumart: album ? getCoverUri(album.coverUri, 200) : getCoverUri(track.coverUri, 200),
        uri: 'yandex_music/track/' + id,
        samplerate: '',
        bitdepth: '',
        trackType: ''
    };
};

Playlist.prototype.landingToPlaylist = function(landing) {
    var id = landing.uid + ':' + landing.kind;
    var cover_uri = (landing.cover.uri) ? landing.cover.uri : (
        (landing.cover.itemsUri && landing.cover.itemsUri[0]) ? landing.cover.itemsUri[0] : ''
    );
    return {
        id: id,
        service: 'yandex_music',
        type: 'playlist',
        name: landing.title,
        title: landing.title,
        duration: (landing.durationMs) ? Math.ceil(landing.durationMs / 1000) : 0,
        albumart: (cover_uri) ? getCoverUri(cover_uri, 200) : '/albumart?sourceicon=music_service/yandex_music/icons/playlist.png',
        uri: 'yandex_music/playlist/' + id,
    };
};

Playlist.prototype.albumToAlbum = function(landing) {
    var id = landing.id;
    return {
        id: id,
        service: 'yandex_music',
        type: 'folder',
        name: landing.title,
        title: landing.title,
        album: landing.title,
        artist: landing.artists[0] ? landing.artists[0].name : '',
        albumart: getCoverUri(landing.coverUri, 200),
        uri: 'yandex_music/album/' + id,
    };
};

Playlist.prototype.artistToArtist = function(artist) {
    var id = artist.id;
    return {
        id: id,
        service: 'yandex_music',
        type: 'folder',
        name: artist.name,
        title: artist.name,
        artist: artist.name,
        albumart: (artist.cover) ? getCoverUri(artist.cover.uri, 200) : '',
        uri: 'yandex_music/artist/' + id,
    };
};

Playlist.prototype.stationToRadio = function(station) {
    var id = station.id.type + ':' + station.id.tag;
    return {
        id: id,
        service: 'yandex_music',
        type: 'playlist',
        name: station.name,
        title: station.name,
        artist: '',
        album: '',
        albumart: getCoverUri(station.fullImageUrl, 200),
        uri: 'yandex_music/radio/' + id,
    };
};

Playlist.prototype.fetch = function() {
    var self = this;

    if (self.type == 'radio') {
        return self.fetchRadio();
    }

    if (self.tracks.length != 0) 
        return libQ.resolve(self.tracks);

    if (self.type == 'playlist') {
        return self.fetchPlaylist();
    }

    if (self.type == 'artist') {
        return self.fetchArtist();
    }

    if (self.type == 'album') {
        return self.fetchAlbum();
    }

    return libQ.reject(new Error('unknown_type'));
};

Playlist.prototype.fetchRadio = function() {
    var self = this;
    var defer = libQ.defer();

    self.client.rotor.sendStationFeedback(self.playlist_id, {
        type: 'radioStarted',
        timestamp: new Date().toISOString(),
        from: 'YandexMusicDesktopAppWindows'
    }, self.batch_id).then(function (resp) {
        self.client.rotor.getStationTracks(self.playlist_id, true).then(function (resp) {
            self.batch_id = resp.result.batchId;
            var tracks = resp.result.sequence.map(function (x) { return self.trackToSong(x.track, false, false, self.playlist_id); });
            self.new_tracks = [];
            for (var i = 0; i < tracks.length; ++i) {
                var new_track = tracks[i];
                var track = self.tracks.find(function (x) { return x.uri == new_track.uri; });
                if (!track) {
                    self.tracks.push(new_track);
                    self.new_tracks.push(new_track);
                }
            }
            defer.resolve(self.tracks);
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
};

Playlist.prototype.fetchPlaylist = function() {
    var self = this;
    var defer = libQ.defer();

    var ids = self.playlist_id.split(':');
    var user_id = (ids.length > 1) ? ids[0] : self.user_id;
    var kind = (ids.length > 1) ? ids[1] : ids[0];

    self.client.playlists.getPlaylistById(user_id, kind).then(function (resp) {
        self.tracks = resp.result.tracks.map(function (x) { return self.trackToSong(x.track, false, false, self.playlist_id); });
        defer.resolve(self.tracks);
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
};

Playlist.prototype.fetchArtist = function() {
    var self = this;
    var defer = libQ.defer();

    self.client.artists.getArtistsBriefInfo(self.playlist_id).then(function (resp) {
        self.title = resp.result.artist.name;
        self.client.artists.getArtistsDirectAlbums(self.playlist_id, 0, 100, 'year').then(function (resp) {
            self.tracks = resp.result.albums.map(function (x) { return self.albumToAlbum(x); });
            defer.resolve(self.tracks);
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
};

Playlist.prototype.fetchAlbum = function() {
    var self = this;
    var defer = libQ.defer();

    self.client.albums.getAlbumsWithTracks(self.playlist_id).then(function (resp) {
        self.title = resp.result.title;
        var album = resp.result;
        var artist = (resp.result.artists[0]) ? resp.result.artists[0] : false;
        var tracks = [];
        for (var i = 0; i < resp.result.volumes.length; ++i) {
            var v = resp.result.volumes[i].map(function (x) { return self.trackToSong(x, album, artist, self.playlist_id); });
            tracks = tracks.concat(v);
        }
        self.tracks = tracks;
        defer.resolve(self.tracks);
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
};

Playlist.prototype.explodeTrack = function(uri) {
    var self = this
    var defer = libQ.defer()

    var track = self.tracks.find(function (x) { return x.uri == uri; });
    if (track) {
        defer.resolve([track]);
    } else {
        var uriParts = uri.split('/');
        var track_id = uriParts.pop();
        var ids = track_id.split('@');
        self.client.tracks.getTracks({
            'track_ids': ids[0],
            'with_positions': false
        }).then(function (resp) {
            var tracks = resp.result.map(function (x) { return self.trackToSong(x, false, false, false); });
            defer.resolve(tracks);
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    }

    return defer.promise;
};

Playlist.prototype.onStartTrack = function(track_id) {
    var self = this
    var defer = libQ.defer();

    if (self.type == 'radio' && self.playlist_id) {
        var ids = track_id.split('@');
        track_id = ids[0];
        self.client.rotor.sendStationFeedback(self.playlist_id, {
            type: 'trackStarted',
            timestamp: new Date().toISOString(),
            trackId: track_id,
        }, self.batch_id).then(function (resp) {
            defer.resolve();
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    } else {
        defer.resolve();
    }

    return defer.promise;
};

Playlist.prototype.onEndTrack = function(track_id, played, is_finished) {
    var self = this
    var defer = libQ.defer();

    if (self.type == 'radio' && self.playlist_id) {
        var ids = track_id.split('@');
        track_id = ids[0];
        self.client.rotor.sendStationFeedback(self.playlist_id, {
            type: (is_finished) ? 'trackFinished' : 'skip',
            timestamp: new Date().toISOString(),
            trackId: track_id,
            totalPlayedSeconds: played,
        }, self.batch_id).then(function (resp) {
            defer.resolve();
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    } else {
        defer.resolve();
    }

    return defer.promise;
};

module.exports = Playlist;
