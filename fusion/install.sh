#!/bin/bash
LIB=/data/plugins/audio_interface/fusiondsp
opath=/data/INTERNAL/FusionDsp


echo "creating filters folder and copying demo filters"


mkdir -m 777 $opath
#mkdir -m 777 $opath/tools
mkdir -m 777 $opath/filters
mkdir -m 777 $opath/filter-sources
mkdir -m 777 $opath/target-curves
mkdir -m 777 $opath/peq
mkdir -m 777 $opath/tools
mkdir -m 777 $opath/presets


chmod -R 777 $opath
chown -R volumio $opath
chgrp -R volumio $opath
echo "copying demo flters"
cp $LIB/*EQ.txt $opath/peq/
cp $LIB/mpdignore $opath/.mpdignore
cp $LIB/readme.txt $opath/readme.txt
cp $LIB/filters/* $opath/filters/
cp $LIB/target-curves/* $opath/target-curves/
cp $LIB/filter-sources/* $opath/filter-sources/
cp $LIB/presets.tar $opath/
cd $opath
tar -xvf presets.tar
chmod -R 777 presets
cd $LIB
rm -Rf $LIB/filters
rm -Rf $LIB/target-curves
rm -Rf $LIB/filters-sources
rm /tmp/camilladsp.log

echo "Installing/fusiondsp dependencies"
sudo apt update
sudo apt -y install python3-aiohttp python3-pip
cd $LIB
sudo tar -xvf fusiondsp.service.tar -C /

wget https://github.com/balbuze/volumio-plugins/raw/alsa_modular/plugins/audio_interface/FusionDsp/cgui-1.0.0.zip
miniunzip cgui-1.0.0.zip
sudo chown -R volumio cgui
sudo chgrp -R volumio cgui
sudo rm cgui-1.0.0.zip

cd $LIB
pip3 install git+https://github.com/HEnquist/pycamilladsp.git@v1.0.0
pip3 install git+https://github.com/HEnquist/pycamilladsp-plot.git@v1.0.2

#echo "remove previous configuration"
#if [ ! -f "/data/configuration/audio_interface/fusiondsp/config.json" ];
#	then
#		echo "file doesn't exist, nothing to do"
#	else
#		echo "File exists removing it"
#		sudo rm -Rf /data/configuration/audio_interface/fusiondsp
#fi

		
echo "copying hw detection script"
# Find arch
cpu=$(lscpu | awk 'FNR == 1 {print $2}')
echo "Detected cpu architecture as $cpu"
if [ $cpu = "armv7l" ] || [ $cpu = "aarch64" ] 
then
cd /tmp
wget https://github.com/HEnquist/camilladsp/releases/download/v1.0.2/camilladsp-linux-armv7.tar.gz
tar -xf camilladsp-linux-armv7.tar.gz -C /tmp
chown volumio camilladsp
chgrp volumio camilladsp
chmod +x camilladsp
mv /tmp/camilladsp $LIB/
rm /tmp/camilladsp-linux-armv7.tar.gz
sudo cp $LIB/c/hw_params_arm $LIB/hw_params
sudo chmod +x $LIB/hw_params

#sudo apt-get update
sudo apt-get -y install drc

elif [ $cpu = "x86_64" ]
then
cd /tmp
wget https://github.com/balbuze/volumio-plugins/raw/alsa_modular/plugins/audio_interface/FusionDsp/bin/camilladsp-linux-amd64-1.0.2.tar.gz
tar -xf camilladsp-linux-amd64-1.0.2.tar.gz -C /tmp
chown volumio camilladsp
chgrp volumio camilladsp
chmod +x camilladsp
mv /tmp/camilladsp $LIB/
rm /tmp/camilladsp-linux-amd64.tar.gz
cp $LIB/c/hw_params_amd64 $LIB/hw_params
chmod +x $LIB/hw_params

#sudo apt-get update
sudo apt-get -y install drc

elif [ $cpu = "armv6l" ]
then
cd /tmp
wget https://github.com/balbuze/volumio-plugins/raw/alsa_modular/plugins/audio_interface/FusionDsp/bin/camilladsp-linux-armv6l.tar.gz
tar -xf camilladsp-linux-armv6l.tar.gz -C /tmp
chown volumio camilladsp
chgrp volumio camilladsp
chmod +x camilladsp
mv /tmp/camilladsp $LIB/
rm /tmp/camilladsp-linux-armv6l.tar.gz
cp $LIB/c/hw_params_armv6l $LIB/hw_params
chmod +x $LIB/hw_params
touch /data/plugins/audio_interface/fusiondsp/cpuarmv6l
else
    echo "Sorry, cpu is $cpu and your device is not yet supported !"
	echo "exit now..."
	exit -1
fi

#required to end the plugin install
echo "plugininstallend"

