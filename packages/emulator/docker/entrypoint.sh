#!/usr/bin/env bash
set -euo pipefail

# Start pulse audio
# export PULSE_SERVER=unix:/tmp/pulse-socket
# pulseaudio -D --log-target=newfile:/tmp/pulseverbose.log --exit-idle-time=-1

# Start mitmproxy
mitmweb --set listen_port=7999 --set web_host="0.0.0.0" --set web_port=8082 --set web_open_browser=false &
sleep 3s
hashed_name=`openssl x509 -inform PEM -subject_hash_old -in ~/.mitmproxy/mitmproxy-ca-cert.cer | head -1`
cp ~/.mitmproxy/mitmproxy-ca-cert.cer ~/.mitmproxy/$hashed_name.0

# Start adb and emulator
adb start-server
emulator -avd device -gpu host -ports 5554,5555 -grpc 8554 -read-only -no-metrics &
adb wait-for-device
until adb root; do echo "Failed to run adb root"; sleep 1s; done

# Start frida server
until adb push /usr/local/bin/android-frida-server /data/local/tmp/; do echo "Failed to push frida server"; sleep 1s; done
until adb shell "chmod 755 /data/local/tmp/android-frida-server"; do echo "Failed to make frida server executable"; sleep 1s; done
sleep 5s
adb shell "/data/local/tmp/android-frida-server" &
adb forward tcp:27043 tcp:27042
socat tcp-listen:27042,reuseaddr,fork tcp:127.0.0.1:27043 &

# Finish setup mitm cert on android emulator
adb push ~/.mitmproxy/$hashed_name.0 /data/misc/user/0/cacerts-added/$hashed_name.0
adb shell "su 0 chmod 644 /data/misc/user/0/cacerts-added/$hashed_name.0"

# Start envoy proxy
envoy -c /etc/envoy/envoy.yaml &

# Done!
sleep infinity
