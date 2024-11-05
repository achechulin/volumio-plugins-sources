# Yandex Music for Volumio

[Yandex Music](https://music.yandex.ru/) is a service for finding and listening 
to music and podcasts that provides personalized recommendations for each user.

You need a Yandex Music subscription to use this plugin.

## Manual Installation

To install the plugin manually, first make sure you have 
[enabled SSH access](https://developers.volumio.com/SSH%20Connection) 
on your Volumio device. Then, SSH into Volumio and do the following:

```
// SSH terminal:
// (You can copy and paste each line after the $ sign)

volumio:~$ git clone https://github.com/achechulin/volumio-plugins-sources
volumio:~$ cd volumio-plugins-sources/yandex_music
volumio:~/volumio-plugins-sources/yandex_music$ volumio plugin install

...
Progress: 100
Status :Yandex Music Successfully Installed, Do you want to enable the plugin now?
...

// If the process appears to hang at this point, just press Ctrl-C to return to the terminal.
```

Now access Volumio in a web browser. Go to ``Plugins -> Installed plugins`` and enable the 
Yandex Music plugin by activating the switch next to it.

Next go to ``Settings`` and provide login and password to obtain access token
for Yandex Music service.

## Manual Update

Assuming you have manually installed the plugin with the instructions above, 
and you have not deleted the directory to which you cloned this repo, 
you can SSH into Volumio and manually update the plugin as follows:

```
// SSH terminal:
// (You can copy and paste each line after the $ sign)

volumio:~$ cd ~/volumio-plugins-sources/yandex_music
volumio:~/volumio-plugins-sources/yandex_music$ rm -rf node_modules
volumio:~/volumio-plugins-sources/yandex_music$ git pull
...
volumio:~/volumio-plugins-sources/yandex_music$ volumio plugin update

This command will update the plugin on your device
...
Progress: 100
Status :Successfully updated plugin

// If the process appears to hang at this point, just press Ctrl-C to return to the terminal.

volumio:~/volumio-plugins-sources/yandex_music$ systemctl restart volumio
```

## Thanks

Thanks to [Yandex Music API by MarshalX](https://github.com/MarshalX/yandex-music-api),
and [Yandex Music Extension by Alexander Cherkashin](https://github.com/acherkashin/yandex-music-extension).
