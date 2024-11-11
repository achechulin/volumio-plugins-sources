'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var clientApi = require('yandex-music-client').YandexMusicClient;
var querystring = require('querystring');
var axios = require('axios');
var NodeCache = require('node-cache');
var getToken = require('./token.js');
var getTrackUrl = require('./track.js');
var playlist = require('./playlist.js');
var proxy = require('./proxy.js');
var util = require('util');

module.exports = yandexMusic;

function yandexMusic(context) {
    var self = this;

    self.context = context;
    self.commandRouter = self.context.coreCommand;
    self.logger = self.context.logger;
    self.configManager = self.context.configManager;

    // We use a caching manager to speed up the presentation of root page
    self.browseCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

    self.titles = {};
    self.playlists = {};
    self.current_track = false;

    self.proxy = new proxy();
}

yandexMusic.prototype.onVolumioStart = function()
{
    var self = this;
    var configFile = self.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
    self.config = new (require('v-conf'))();
    self.config.loadFile(configFile);
    self.loadI18n();

    self.titles['user:onyourwave'] = self.getI18n('MY_WAVE');

    return libQ.resolve();
}

yandexMusic.prototype.onStart = function() {
    var self = this;

    self.addToBrowseSources();
    self.mpdPlugin = self.commandRouter.pluginManager.getPlugin('music_service', 'mpd');

    self.initClient();

    self.hq = !!self.config.get('hq');
    if (self.hq) {
        self.proxy.start();
    }

    return libQ.resolve();
};

yandexMusic.prototype.onStop = function() {
    var self = this;

    self.removeFromBrowseSources();

    self.proxy.stop();

    return libQ.resolve();
};

yandexMusic.prototype.loadI18n = function () {
    var self = this;
    try {
        var language_code = this.commandRouter.sharedVars.get('language_code');
        self.i18n=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
    } catch(e) {
        self.i18n=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
    }
    self.i18nDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
};

yandexMusic.prototype.getI18n = function (key) {
    var self = this;
    if (key.indexOf('.') > 0) {
        var mainKey = key.split('.')[0];
        var secKey = key.split('.')[1];
        if (self.i18n[mainKey][secKey] !== undefined) {
            return self.i18n[mainKey][secKey];
        } else {
            return self.i18nDefaults[mainKey][secKey];
        }
    } else {
        if (self.i18n[key] !== undefined) {
            return self.i18n[key];
        } else {
            return self.i18nDefaults[key];
        }
    }
};

yandexMusic.prototype.initClient = function() {
    var self = this;

    self.client = new clientApi({
        BASE: 'https://api.music.yandex.net:443',
        HEADERS: {
            'Authorization': 'OAuth ' + self.config.get('token', 'none'),
            'Accept-Language': self.commandRouter.sharedVars.get('language_code'),
            'X-Yandex-Music-Client': 'YandexMusicDesktopAppWindows/5.25.1',
        }
    });

    const status = self.client.account.getAccountStatus().then(function (resp) {
        self.uid = resp.result.account.uid;
    });

    self.playlists = {};
};

// Configuration Methods -----------------------------------------------------------------------------

yandexMusic.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
        __dirname+'/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf)
        {
            var token = self.config.get('token', 'none');
            if (!token || token == 'none') {
                uiconf.sections[0].content[0].value = self.config.get('username', '');
                uiconf.sections[0].content[1].value = self.config.get('password', '');
            } else {
                uiconf.sections[0].content[0].hidden = true;
                uiconf.sections[0].content[1].hidden = true;
                uiconf.sections[0].content[2].value = token;
                uiconf.sections[0].content[2].hidden = false;
                uiconf.sections[0].saveButton.label = self.getI18n('LOGOUT');
                uiconf.sections[0].onSave.method = 'accountLogout';
            }
            uiconf.sections[1].content[0].value = !!self.config.get('hq');
            defer.resolve(uiconf);
        })
        .fail(function()
        {
            defer.reject(new Error());
        });

    return defer.promise;
};

yandexMusic.prototype.getConfigurationFiles = function() {
    return ['config.json'];
}

yandexMusic.prototype.setUIConfig = function(data) {
};

yandexMusic.prototype.getConf = function(varName) {
};

yandexMusic.prototype.setConf = function(varName, varValue) {
};

yandexMusic.prototype.accountLogin = function(data) {
    var self = this;
    var defer = libQ.defer();

    if (data && data['username'] && data['password']) {
        getToken(data['username'], data['password'], self.logger).then(function (token)
        {
            self.config.set('token', token);
            self.commandRouter.pushToastMessage('success', self.getI18n('YAM_ACCOUNT'), self.getI18n('LOGIN_SUCCESSFUL'));
            self.initClient();

            var config = self.getUIConfig();
            config.then(function(conf) {
                self.commandRouter.broadcastMessage('pushUiConfig', conf);
            });
            defer.resolve();
        }).fail(function (err)
        {
            var err_msg;
            if (err instanceof Error && err.message == 'account_not_found') {
                err_msg = self.getI18n('LOGIN_FAILED_INVALID_ACCOUNT');
            } else if (err instanceof Error && err.message == 'password_not_matched') {
                err_msg = self.getI18n('LOGIN_FAILED_INVALID_PASSWORD');
            } else {
                err_msg = self.getI18n('LOGIN_FAILED');
            }
            self.commandRouter.pushToastMessage('error', self.getI18n('YAM_ACCOUNT'), err_msg);
            self.logger.error('Unable to login, getToken failed: ', err);
            defer.resolve();
        });
    } else {
        self.commandRouter.pushToastMessage('error', self.getI18n('YAM_ACCOUNT'), self.getI18n('LOGIN_FAILED_NO_USERNAME'));
        defer.resolve();
    }

    return defer.promise;
};

yandexMusic.prototype.accountLogout = function(data) {
    var self = this;

    self.config.set('token', 'none');
    self.commandRouter.pushToastMessage('success', self.getI18n('YAM_ACCOUNT'), self.getI18n('LOGOUT_SUCCESSFUL'));

    var config = self.getUIConfig();
    config.then(function(conf) {
        self.commandRouter.broadcastMessage('pushUiConfig', conf);
    });

    return libQ.resolve();
};

yandexMusic.prototype.configPlaybackSave = function(data) {
    var self = this;

    self.config.set('hq', data.hq);
    self.commandRouter.pushToastMessage('success', self.getI18n('PLAYBACK'), self.getI18n('PLAYBACK_UPDATED'));

    self.hq = !!self.config.get('hq');
    if (self.hq) {
        self.proxy.start();
    }

    return libQ.resolve();
};

// Playback Controls ---------------------------------------------------------------------------------------

yandexMusic.prototype.addToBrowseSources = function () {
    var data = {
        name: this.getI18n('YM'),
        uri: 'yandex_music',
        plugin_type: 'music_service',
        plugin_name: 'yandex_music',
        albumart: '/albumart?sourceicon=music_service/yandex_music/yandex_music.png'
    };
    this.commandRouter.volumioAddToBrowseSources(data);
};

yandexMusic.prototype.removeFromBrowseSources = function () {

    this.commandRouter.volumioRemoveToBrowseSources(this.getI18n('YM'));
};

yandexMusic.prototype.handleBrowseUri = function (curUri) {
    var self = this;

    var response;
    var uriParts = curUri.split('/');

    if (curUri.startsWith('yandex_music')) {
        if (curUri == 'yandex_music') {
            response = self.browseRoot();
        } else if (curUri == 'yandex_music/myplaylists') {
            response = self.browseMyPlaylists();
        } else if (curUri.startsWith('yandex_music/radio/')) {
            response = self.browseRadio(uriParts.pop());
        } else if (curUri.startsWith('yandex_music/playlist/')) {
            response = self.browsePlaylist(uriParts.pop());
        } else if (curUri.startsWith('yandex_music/artist/')) {
            response = self.browseArtist(uriParts.pop());
        } else if (curUri.startsWith('yandex_music/album/')) {
            response = self.browseAlbum(uriParts.pop());
        } else {
            response = libQ.reject();
        }
    } else {
        response = libQ.reject();
    }

    return response;
};

yandexMusic.prototype.browseRoot = function () {
    var self = this;
    var defer = libQ.defer();

    if (!self.uid) {
        var response = {
            navigation: {
                lists: [
                    {
                        "availableListViews": [
                            "grid","list"
                        ],
                        "type": "title",
                        "title": self.getI18n('USERNAME_TIP'),
                        "items": []
                    },
                ]
            }
        };
        return libQ.resolve(response);
    }

    self.browseCache.get('root', function(err, value){
        if (!err) {
            // Root has not been cached yet
            if (value == undefined) {
                self.listRoot().then( (data) => {
                    // Set root cache
                    self.browseCache.set('root', data);
                    defer.resolve(data);
                });
            } else {
                // Cached Root
                defer.resolve(value);
            }
        } else {
            self.logger.error('Could not fetch root yandex_music folder cached data: ', err);
        }
    });

    return defer.promise;
};

yandexMusic.prototype.listRoot = function () {
    var self = this;
    var defer = libQ.defer();

    var response = {
        navigation: {
            lists: [
                {
                    "availableListViews": [
                        "grid","list"
                    ],
                    "type": "title",
                    "title": self.getI18n('MY_WAVE'),
                    "items": [
                        {
                            service: 'yandex_music',
                            type: 'playlist',
                            title: self.getI18n('MY_PLAYLISTS'),
                            artist: '',
                            album: '',
                            albumart: '/albumart?sourceicon=music_service/yandex_music/icons/playlist.png',
                            uri: 'yandex_music/myplaylists'
                        },
                    ]
                },
                {
                    "availableListViews": [
                        "grid","list"
                    ],
                    "type": "title",
                    "title": self.getI18n('MY_SELECTED'),
                    "items": [
                    ]
                },
                {
                    "availableListViews": [
                        "grid","list"
                    ],
                    "type": "title",
                    "title": self.getI18n('MY_NEW_RELEASES'),
                    "items": [
                    ]
                },
                {
                    "availableListViews": [
                        "grid","list"
                    ],
                    "type": "title",
                    "title": self.getI18n('MY_POP_PLAYLISTS'),
                    "items": [
                    ]
                },
                {
                    "availableListViews": [
                        "grid","list"
                    ],
                    "type": "title",
                    "title": self.getI18n('MY_PLAY_CONTEXTS'),
                    "items": [
                    ]
                },
            ]
        }
    };

    self.client.landing.getLandingBlocks('personal-playlists,new-releases,new-playlists,play-contexts').then(function (resp) {
        var p = new playlist(self.client, self.user_id);
        var block;
        // Selected for You
        block = resp.result.blocks.find(function (x) { return x.type == 'personal-playlists'; });
        if (block) {
            var blocks = block.entities.map(function (x) { return p.landingToPlaylist(x.data.data); });
            for (var i = 0; i < blocks.length; ++i) {
                self.titles[blocks[i].id] = blocks[i].title;
                response.navigation.lists[1].items.push(blocks[i]);
            }
        }
        // New releases
        block = resp.result.blocks.find(function (x) { return x.type == 'new-releases'; });
        if (block) {
            var blocks = block.entities.map(function (x) { return p.albumToAlbum(x.data); });
            for (var i = 0; i < blocks.length; ++i) {
                response.navigation.lists[2].items.push(blocks[i]);
            }
        }
        // Popular playlists
        block = resp.result.blocks.find(function (x) { return x.type == 'new-playlists'; });
        if (block) {
            var blocks = block.entities.map(function (x) { return p.landingToPlaylist(x.data); });
            for (var i = 0; i < blocks.length; ++i) {
                self.titles[blocks[i].id] = blocks[i].title;
                response.navigation.lists[3].items.push(blocks[i]);
            }
        }
        // Recently played
        block = resp.result.blocks.find(function (x) { return x.type == 'play-contexts'; });
        if (block) {
            var albums = block.entities.filter(function (x) { return x.data.context == 'album'; });
            var blocks = albums.map(function (x) { return p.albumToAlbum(x.data.payload); });
            for (var i = 0; i < blocks.length; ++i) {
                response.navigation.lists[4].items.push(blocks[i]);
            }
        }
        // Radio dashboard
        self.client.rotor.getRotorStationsDashboard().then(function (resp) {
            var blocks = resp.result.stations.map(function (x) { return p.stationToRadio(x.station); });
            for (var i = 0; i < blocks.length; ++i) {
                self.titles[blocks[i].id] = blocks[i].title;
                response.navigation.lists[0].items.push(blocks[i]);
            }
            defer.resolve(response);
        }).catch(function (err) {
            defer.resolve(response);
        });
    }).catch(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.browseMyPlaylists = function () {
    var self = this;
    var defer = libQ.defer();

    self.client.user.getPlayLists(self.uid).then(function (resp) {

        var response = {
            navigation: {
                lists: [
                    {
                        "availableListViews": [
                            "grid","list"
                        ],
                        "type": "title",
                        "title": self.getI18n('MY_PLAYLISTS'),
                        "items": [],
                    }
                ]
            }
        };

        var p = new playlist(self.client, self.user_id);
        var blocks = resp.result.map(function (x) { return p.landingToPlaylist(x); });
        for (var i = 0; i < blocks.length; ++i) {
            self.titles[blocks[i].id] = blocks[i].title;
            response.navigation.lists[0].items.push(blocks[i]);
        }

        defer.resolve(response);
    }).catch(function (err) {
        self.logger.error(util.inspect(err));
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.browseRadio = function (playlist_id) {
    var self = this;
    var defer = libQ.defer();

    // Always create new radio
    self.playlists[playlist_id] = new playlist(self.client, self.uid, playlist_id, 'radio', self.logger);
    self.playlists[playlist_id].title = self.titles[playlist_id];

    self.playlists[playlist_id].fetch().then(function (tracks) {
        var response = {
            navigation: {
                lists: [
                    {
                        "availableListViews": ["list"],
                        "type": "playlist",
                        "title": self.playlists[playlist_id].title,
                        "items": tracks
                    }
                ]
            }
        };
        defer.resolve(response);
    }).fail(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.browsePlaylist = function (playlist_id) {
    var self = this;
    var defer = libQ.defer();

    if (!self.playlists[playlist_id]) {
        self.playlists[playlist_id] = new playlist(self.client, self.uid, playlist_id, 'playlist', self.logger);
        self.playlists[playlist_id].title = self.titles[playlist_id];
    }

    self.playlists[playlist_id].fetch().then(function (tracks) {
        var response = {
            navigation: {
                lists: [
                    {
                        "availableListViews": ["list"],
                        "type": "playlist",
                        "title": self.playlists[playlist_id].title,
                        "items": tracks
                    }
                ]
            }
        };
        defer.resolve(response);
    }).fail(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.browseArtist = function (playlist_id) {
    var self = this;
    var defer = libQ.defer();

    var internal_id = 'a' + playlist_id;

    if (!self.playlists[internal_id]) {
        self.playlists[internal_id] = new playlist(self.client, self.uid, playlist_id, 'artist', self.logger);
    }

    self.playlists[internal_id].fetch().then(function (tracks) {
        var response = {
            navigation: {
                lists: [
                    {
                        "availableListViews": ["list"],
                        "type": "folder",
                        "title": self.playlists[internal_id].title,
                        "items": tracks
                    }
                ]
            }
        };
        defer.resolve(response);
    }).fail(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.browseAlbum = function (playlist_id) {
    var self = this;
    var defer = libQ.defer();

    if (!self.playlists[playlist_id]) {
        self.playlists[playlist_id] = new playlist(self.client, self.uid, playlist_id, 'album', self.logger);
    }

    self.playlists[playlist_id].fetch().then(function (tracks) {
        var response = {
            navigation: {
                lists: [
                    {
                        "availableListViews": ["list"],
                        "type": "folder",
                        "title": self.playlists[playlist_id].title,
                        "items": tracks
                    }
                ]
            }
        };
        defer.resolve(response);
    }).fail(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.onTrackChanging = function(track) {
    var self = this;

    var now = new Date().getTime();

    if (self.current_track) {
        var p = self.playlists[self.current_track.playlist_id];
        if (p && p.type == 'radio') {
            var played = (now - self.current_track.start) / 1000;
            var is_finished = Math.abs(played - self.current_track.duration) < 8;
            p.onEndTrack(self.current_track.track_id, played, is_finished).then(function () {
                p.fetch().then(function (tracks) {
                    for (var i = 0; i < p.new_tracks.length; ++i) {
                        self.commandRouter.addQueueItems([{
                            uri: p.new_tracks[i].uri,
                            service: 'yandex_music',
                        }]);
                    }
                }).fail(function (err) {
                });
            });
        }
    };

    var track_id = track.uri.split('/').pop();
    var ids = track_id.split('@');
    var playlist_id = (ids.length > 0) ? ids[1] : '';

    self.current_track = Object.assign({}, track);
    self.current_track.track_id = track_id;
    self.current_track.playlist_id = playlist_id;
    self.current_track.start = now;
};

yandexMusic.prototype.onTrackChanged = function() {
    var self = this;

    if (self.current_track && self.current_track.track_id && self.current_track.playlist_id) {
        var p = self.playlists[self.current_track.playlist_id];
        if (p && p.type == 'radio') {
            p.onStartTrack(self.current_track.track_id);
        }
    }
};

// Define a method to clear, add, and play an array of tracks
yandexMusic.prototype.clearAddPlayTrack = function(track) {
    var self = this;

    self.onTrackChanging(track);

    var track_id = track.uri.split('/').pop();
    var ids = track_id.split('@');
    var playlist_id = (ids.length > 0) ? ids[1] : '';
    var track_uri;

    return self.mpdPlugin.sendMpdCommand('stop', [])
        .then(function () {
            return self.mpdPlugin.sendMpdCommand('clear', []);
        })
        .then(function () {
            return getTrackUrl(self.client, track_id, self.hq, self.logger);
        })
        .then(function (data) {
            track_uri = data.uri;
            track.codec = data.codec;
            track.bitrate = data.bitrate;
            return self.mpdPlugin.sendMpdCommand('addid "' + track_uri + '"', []);
        })
        .then(function (resp)  {
            if (resp && typeof resp.Id != undefined) {
                var cmds = [
                    {command: 'addtagid', parameters: [resp.Id, 'title', track.title]},
                    {command: 'addtagid', parameters: [resp.Id, 'album', track.album]},
                    {command: 'addtagid', parameters: [resp.Id, 'artist', track.artist]}
                ];
                return self.mpdPlugin.sendMpdCommandArray(cmds);
            } else {
                return libQ.resolve();
            }
        })
        .then(function () {
            self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
            return self.mpdPlugin.sendMpdCommand('play', []);
        })
        .then(function () {
            self.onTrackChanged();
            return libQ.resolve();
        });
};

// Prefetch for gapless Playback
yandexMusic.prototype.prefetch = function(track) {
    var self = this;

    self.onTrackChanging(track);

    var track_id = track.uri.split('/').pop();

    return getTrackUrl(self.client, track_id, self.hq, self.logger)
        .then(function (data) {
            return self.mpdPlugin.sendMpdCommand('addid "' + data.uri + '"', [])
        })
        .then(function (resp)  {
            if (resp && typeof resp.Id != undefined) {
                var cmds = [
                    {command: 'addtagid', parameters: [resp.Id, 'title', track.title]},
                    {command: 'addtagid', parameters: [resp.Id, 'album', track.album]},
                    {command: 'addtagid', parameters: [resp.Id, 'artist', track.artist]}
                ];
                return self.mpdPlugin.sendMpdCommandArray(cmds);
            } else {
                return libQ.resolve();
            }
        })
        .then(function () {
            return self.mpdPlugin.sendMpdCommand('consume 1', []);
        })
        .then(function () {
            self.onTrackChanged();
            return libQ.resolve();
        });
}

// Seek
yandexMusic.prototype.seek = function (timepos) {
    var self = this;

    return self.mpdPlugin.seek(timepos);
};

// Stop
yandexMusic.prototype.stop = function() {
    var self = this;

    self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
    return self.mpdPlugin.stop();
};

// Pause
yandexMusic.prototype.pause = function() {
    var self = this;

    self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
    return self.mpdPlugin.pause();
};

// Resume
yandexMusic.prototype.resume = function () {
    var self = this;

    self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
    return self.mpdPlugin.resume();
};

// Next
yandexMusic.prototype.next = function() {
    var self = this;

    self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
    return self.mpdPlugin.next();
}

// Previous
yandexMusic.prototype.previous = function() {
    self.commandRouter.stateMachine.setConsumeUpdateService('mpd');
    return self.mpdPlugin.previous();
}

// Get state
yandexMusic.prototype.getState = function() {
};

//Parse state
yandexMusic.prototype.parseState = function(sState) {
};

// Announce updated State
yandexMusic.prototype.pushState = function(state) {
    return this.commandRouter.servicePushState(state, 'yandex_music');
};

yandexMusic.prototype.explodeUri = function(curUri) {
    var self = this;

    var response;
    var uriParts = curUri.split('/');

    if (curUri.startsWith('yandex_music')) {
        if (curUri.startsWith('yandex_music/track/')) {
            var track_id = uriParts.pop();
            var ids = track_id.split('@');
            var playlist_id = (ids.length > 0) ? ids[1] : '';
            var p = self.playlists[playlist_id];
            if (!p) {
                p = new playlist(self.client, self.user_id);
            }
            response = p.explodeTrack(curUri);
        } else if (curUri.startsWith('yandex_music/myplaylists')) {
            var defer = libQ.defer();
            self.client.user.getPlayLists(self.uid).then(function (resp) {
                var promises = [];
                for (var i = 0; i < resp.result.length; ++i) {
                    var id = resp.result[i].uid + ':' + resp.result[i].kind;
                    if (!self.playlists[id]) {
                        self.playlists[id] = new playlist(self.client, self.uid, id, 'playlist', self.logger);
                    }
                    promises.push(self.playlists[id].fetch());
                }
                libQ.all(promises).then(function (playlist_tracks) {
                    var tracks = [];
                    for (var i = 0; i < playlist_tracks.length; ++i) {
                        tracks = tracks.concat(playlist_tracks[i]);
                    }
                    defer.resolve(tracks);
                }).fail(function (err) {
                    defer.reject(new Error(err));
                });
            }).catch(function (err) {
                defer.reject(new Error(err));
            });
            response = defer.promise;
        } else if (curUri.startsWith('yandex_music/radio/')) {
            var playlist_id = uriParts.pop();
            if (!self.playlists[playlist_id]) {
                self.playlists[playlist_id] = new playlist(self.client, self.uid, playlist_id, 'radio', self.logger);
            }
            response = self.playlists[playlist_id].fetch();
        } else if (curUri.startsWith('yandex_music/playlist/')) {
            var playlist_id = uriParts.pop();
            if (!self.playlists[playlist_id]) {
                self.playlists[playlist_id] = new playlist(self.client, self.uid, playlist_id, 'playlist', self.logger);
            }
            response = self.playlists[playlist_id].fetch();
        } else if (curUri.startsWith('yandex_music/artist/')) {
            var defer = libQ.defer();
            var playlist_id = uriParts.pop();
            var internal_id = 'a' + playlist_id;
            if (!self.playlists[internal_id]) {
                self.playlists[internal_id] = new playlist(self.client, self.uid, playlist_id, 'artist', self.logger);
            }
            self.playlists[internal_id].fetch().then(function (albums) {
                var promises = [];
                for (var i = 0; i < albums.length; ++i) {
                    var id = albums[i].id;
                    if (!self.playlists[id]) {
                        self.playlists[id] = new playlist(self.client, self.uid, id, 'album', self.logger);
                    }
                    promises.push(self.playlists[id].fetch());
                }
                libQ.all(promises).then(function (album_tracks) {
                    var tracks = [];
                    for (var i = 0; i < album_tracks.length; ++i) {
                        tracks = tracks.concat(album_tracks[i]);
                    }
                    defer.resolve(tracks);
                }).fail(function (err) {
                    defer.reject(new Error(err));
                });
            }).fail(function (err) {
                defer.reject(new Error(err));
            });
            response = defer.promise;
        } else if (curUri.startsWith('yandex_music/album/')) {
            var playlist_id = uriParts.pop();
            if (!self.playlists[playlist_id]) {
                self.playlists[playlist_id] = new playlist(self.client, self.uid, playlist_id, 'album', self.logger);
            }
            response = self.playlists[playlist_id].fetch();
        } else {
            response = libQ.reject();
        }
    } else {
        response = libQ.reject();
    }

    return response;
};

yandexMusic.prototype.getAlbumArt = function (data, path) {

    var artist, album;

    if (data != undefined && data.path != undefined) {
        path = data.path;
    }

    var web;

    if (data != undefined && data.artist != undefined) {
        artist = data.artist;
        if (data.album != undefined)
            album = data.album;
        else album = data.artist;

        web = '?web=' + nodetools.urlEncode(artist) + '/' + nodetools.urlEncode(album) + '/large'
    }

    var url = '/albumart';

    if (web != undefined)
        url = url + web;

    if (web != undefined && path != undefined)
        url = url + '&';
    else if (path != undefined)
        url = url + '?';

    if (path != undefined)
        url = url + 'path=' + nodetools.urlEncode(path);

    return url;
};

yandexMusic.prototype.search = function (query) {
    return this._search(query.value, 'all');
};

yandexMusic.prototype._search = function (text, type) {
    var self = this;
    var defer = libQ.defer();

    self.client.search.search(text, 0, type, false).then(function (resp) {
        var response = {
            "title": self.getI18n('SEARCH_RESULTS'),
            "icon": "fa fa-music",
            "availableListViews": ["list", "grid"],
            "items": [
            ]
        };

        var p = new playlist(self.client, self.user_id);
        var items;
        var block;

        block = resp.result.best;
        if (block && (block.type == 'artist' || block.type == 'album')) {
            response.items.push({"type": "title", "title": self.getI18n('SEARCH_BEST_SECTION')});
            if (block.type == 'artist') {
                response.items.push(p.artistToArtist(block.result));
            }
            if (block.type == 'album') {
                response.items.push(p.albumToAlbum(block.result));
            }
        }

        block = resp.result.artists;
        if (block && block.results.length > 0) {
            response.items.push({"type": "title", "title": self.getI18n('SEARCH_ARTISTS_SECTION')});
            items = block.results.map(function (x) { return p.artistToArtist(x); });
            for (var i = 0; i < items.length; ++i) {
                response.items.push(items[i]);
            }
        }

        block = resp.result.albums;
        if (block && block.results.length > 0) {
            response.items.push({"type": "title", "title": self.getI18n('SEARCH_ALBUMS_SECTION')});
            items = block.results.map(function (x) { return p.albumToAlbum(x); });
            for (var i = 0; i < items.length; ++i) {
                response.items.push(items[i]);
            }
        }

        block = resp.result.tracks;
        if (block && block.results.length > 0) {
            response.items.push({"type": "title", "title": self.getI18n('SEARCH_SONGS_SECTION')});
            items = block.results.map(function (x) { return p.albumToAlbum(x); });
            for (var i = 0; i < items.length; ++i) {
                response.items.push(items[i]);
            }
        }

        defer.resolve(response);
    }).catch(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};

yandexMusic.prototype.goto = function(data){
    var self = this;
    var defer = libQ.defer();

    self._search(data.value, data.type).then(function (data) {
        var response = {
            navigation: {
                lists: [
                    data 
                ]
            }
        };
        defer.resolve(response);
    }).fail(function (err) {
        defer.reject(new Error());
    });

    return defer.promise;
};
