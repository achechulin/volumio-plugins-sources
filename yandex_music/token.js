'use strict';

var libQ = require('kew');
var querystring = require('querystring');
var axios = require('axios');
var tough = require('tough-cookie');

function getToken(username, password) {
    var defer = libQ.defer();

    // https://github.com/AlexxIT/YandexStation/blob/master/custom_components/yandex_station/core/yandex_session.py
    axios.get('https://passport.yandex.ru/am?app_platform=android').then(function (resp) {
        // login_username
        var cookies = new tough.CookieJar();
        var c = resp.headers['set-cookie'];
        if (c) {
            for (var i = 0; i < c.length; ++i) {
                cookies.setCookieSync(c[i], 'https://passport.yandex.ru');
            }
        }
        var csrf_token = resp.data.match(/"csrf_token" value="([^"]+)"/)[1];
        var params = querystring.stringify({
            'csrf_token': csrf_token,
            'login': username
        });
        axios.post('https://passport.yandex.ru/registration-validations/auth/multi_step/start', params, {
            'headers': { "Content-Type": "application/x-www-form-urlencoded", 
                "Cookie": cookies.getSetCookieStringsSync('https://passport.yandex.ru') }
        }).then(function (resp) {
            var c = resp.headers['set-cookie'];
            if (c) {
                for (var i = 0; i < c.length; ++i) {
                    cookies.setCookieSync(c[i], 'https://passport.yandex.ru');
                }
            }
            // login_password
            if (resp.data.status == 'ok' && resp.data.can_authorize) {
                var params = querystring.stringify({
                    'csrf_token': csrf_token,
                    'track_id': resp.data.track_id,
                    'password': password,
                    'retpath': 'https://passport.yandex.ru/am/finish?status=ok&from=Login'
                });
                axios.post('https://passport.yandex.ru/registration-validations/auth/multi_step/commit_password', params, {
                    'headers': { "Content-Type": "application/x-www-form-urlencoded", 
                    "Cookie": cookies.getSetCookieStringsSync('https://passport.yandex.ru') }
                }).then(function (resp) {
                    // login_cookies
                    if (resp.data.status == 'ok') {
                        var c = resp.headers['set-cookie'];
                        if (c) {
                            for (var i = 0; i < c.length; ++i) {
                                cookies.setCookieSync(c[i], 'https://passport.yandex.ru');
                            }
                        }
                        var c_arr = cookies.getCookiesSync('https://passport.yandex.ru');
                        var ya_cookie = c_arr.map(function (x) { return '' + x.key + '=' + x.value; }).join("; ");
                        var params = querystring.stringify({
                            'client_id': 'c0ebe342af7d48fbbbfcf2d2eedb8f9e',
                            'client_secret': 'ad0a908f0aa341a182a37ecd75bc319e'
                        });
                        axios.post('https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid', params, {
                            'headers': { "Ya-Client-Host": "passport.yandex.ru", "Content-Type": "application/x-www-form-urlencoded", 
                                "Ya-Client-Cookie": ya_cookie }
                        }).then(function (resp) {
                            // get_music_token
                            if (resp.data.status == 'ok') {
                                var params = querystring.stringify({
                                    'client_secret': '53bc75238f0c4d08a118e51fe9203300',
                                    'client_id': '23cabbbdc6cd418abb4b39c32c41195d',
                                    'grant_type': 'x-token',
                                    'access_token': resp.data.access_token
                                });
                                axios.post('https://oauth.mobile.yandex.net/1/token', params, {
                                    'headers': { "Content-Type": "application/x-www-form-urlencoded" }
                                }).then(function (resp) {
                                    defer.resolve(resp.data.access_token);
                                }).catch(function (err) {
                                    defer.reject(new Error(err));
                                });
                            } else {
                                defer.reject(new Error('token_error'));
                            }
                        }).catch(function (err) {
                            defer.reject(new Error(err));
                        });
                    } else {
                        defer.reject(new Error('password_not_matched'));
                    }
                }).catch(function (err) {
                    defer.reject(new Error(err));
                });
            } else {
                defer.reject(new Error('account_not_found'));
            }
        }).catch(function (err) {
            defer.reject(new Error(err));
        });
    }).catch(function (err) {
        defer.reject(new Error(err));
    });

    return defer.promise;
}

module.exports = getToken;
