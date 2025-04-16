export const PULSE_AUDIO_BLOB = `# This is a NOP configuration for pulse audio, all audio goes nowhere!
load-module module-null-sink sink_name=NOP sink_properties=device.description=NOP

# Make pulse accessible on all channels. We only have null audio, and Docker
# should isolate our network anyways.
load-module module-native-protocol-unix auth-anonymous=1 socket=/tmp/pulse-socket
load-module module-native-protocol-tcp  auth-anonymous=1
`;

export const DOCKERFILE_BLOB = `FROM alpine:latest as dependency-preparer
ENV MITM_PROXY_VERSION="11.0.0"
ENV ENVOY_PROXY_VERSION="1.32.0"
ENV FRIDA_SERVER_VERSION="16.5.9"

WORKDIR /tmp
RUN apk add openssl wget xz tar && \\
    wget "https://downloads.mitmproxy.org/\${MITM_PROXY_VERSION}/mitmproxy-\${MITM_PROXY_VERSION}-linux-x86_64.tar.gz" && \\
    wget "https://github.com/envoyproxy/envoy/releases/download/v\${ENVOY_PROXY_VERSION}/envoy-\${ENVOY_PROXY_VERSION}-linux-x86_64" && \\
    wget "https://github.com/frida/frida/releases/download/\${FRIDA_SERVER_VERSION}/frida-server-\${FRIDA_SERVER_VERSION}-android-x86_64.xz" && \\
    tar -xzf "mitmproxy-\${MITM_PROXY_VERSION}-linux-x86_64.tar.gz" && \\
    xz --decompress "frida-server-\${FRIDA_SERVER_VERSION}-android-x86_64.xz"

FROM appium/appium:latest
ENV NVIDIA_DRIVER_CAPABILITIES="compute,utility,video,display,graphics"

ENV MITM_PROXY_VERSION="11.0.0"
ENV ENVOY_PROXY_VERSION="1.32.0"
ENV FRIDA_SERVER_VERSION="16.5.9"
COPY --from=dependency-preparer "/tmp/mitmweb" "/usr/local/bin/mitmweb"
COPY --from=dependency-preparer "/tmp/mitmdump" "/usr/local/bin/mitmdump"
COPY --from=dependency-preparer "/tmp/mitmproxy" "/usr/local/bin/mitmproxy"
COPY --from=dependency-preparer "/tmp/envoy-\${ENVOY_PROXY_VERSION}-linux-x86_64" "/usr/local/bin/envoy"
COPY --from=dependency-preparer "/tmp/frida-server-\${FRIDA_SERVER_VERSION}-android-x86_64" "/usr/local/bin/android-frida-server"

USER root
ENV EMULATOR_API_LEVEL="30"
ENV EMULATOR_DEVICE="pixel_2"
ENV EMULATOR_SYS_IMG="x86_64"
ENV EMULATOR_IMG_TYPE="google_apis"
RUN yes | sdkmanager --licenses && \\
    sdkmanager "platforms;android-\${EMULATOR_API_LEVEL}" "system-images;android-\${EMULATOR_API_LEVEL};\${EMULATOR_IMG_TYPE};\${EMULATOR_SYS_IMG}" && \\
    $ANDROID_HOME/cmdline-tools/tools/bin/avdmanager create avd --name "device" --package "system-images;android-\${EMULATOR_API_LEVEL};\${EMULATOR_IMG_TYPE};\${EMULATOR_SYS_IMG}" --device "\${EMULATOR_DEVICE}" && \\
    ln -s \${ANDROID_HOME}/emulator/emulator /usr/bin/

COPY entrypoint.sh /
COPY envoy.yaml /etc/envoy/envoy.yaml
COPY default.pulse-audio /etc/pulse/default.pa
COPY nginx.conf /etc/nginx/sites-enabled/default
COPY emulator_access.json /opt/android/emulator/lib/emulator_access.json
RUN chmod +x /usr/local/bin/envoy && \\
    chmod +x /usr/local/bin/mitmweb && \\
    chmod +x /usr/local/bin/mitmdump && \\
    chmod +x /usr/local/bin/mitmproxy && \\
    chmod +x /entrypoint.sh && \\
    sudo apt-get update && \\
    sudo apt-get install -y socat && \\
    rm -rf /var/lib/apt/lists/*

EXPOSE 5554 5555 8080 8081 8554 8555 27042
CMD ["/entrypoint.sh"]
`;

export const EMULATOR_ACCESS_BLOB = `// https://android.googlesource.com/platform/prebuilts/android-emulator/+/refs/heads/main/linux-x86_64/lib/emulator_access.json

// This contains the allow lists of the emulator gRPC endpoint.
// This list defines which sets of methods are accessible by whom.
//
// You can protect the gRPC services as follows:
//
// - Unprotected: The set of methods that can be invoked even when
//                no access token is presented. No security checks will
//                be performed when these methods are invoked.
//
// - allowlist: A set of json objects that specifies for each token issuer,
//              what is allowed and what requires an "aud" field.
//
//             - "iss": The token issuer.
//             - "allowed": List of methods which are allowed, even if no "aud" field
//                        is present on the jwt token.
//             - "protected": List of methods which are allowed *ONLY IF* the given method
//                        is present in the "aud" field of the jwt token.
//             Note: Methods that are not on the allowed or protected list will ALWAYS be rejected.
{
    // Set of methods that do not require any validations, they do not require a token.
    // You are always able to invoke this method, without presenting any form of authentication.
    // This is a list of regular expressions. Access will be granted if the regular expression
    // matches the endpoint.
    "unprotected": [
        ".*"
        // ".*" // Matches every method, no authentication will be used **DANGER**
        // "/android.emulation.control.SnapshotService.*" // Everyone can make snapshots.
    ],
    // List of methods that require a token, these are the methods
    // we will allow if you present a signed JWT token.
    "allowlist": [
        {
            // Removing android-studio from the allowlist *WILL* break the embedded emulator.
            // You probably do not want to change this.
            "iss": "android-studio", // Tokens issued by android-studio
            // Can access the following set of methods, even if the AUD claim for
            // the given method is *NOT* present.
            "allowed": [
                "/android.emulation.control.EmulatorController/.*",
                // Interaction with extended controls.
                "/android.emulation.control.UiController/.*",
                // Snapshot related functions
                "/android.emulation.control.SnapshotService/.*",
                // Incubating services
                "/android.emulation.control.incubating.*"
            ]
        },
        {
            "iss": "icebox",
            "protected": [
                "/android.emulation.control.SnapshotService/PullSnapshot",
                "/android.emulation.control.SnapshotService/DeleteSnapshot",
                "/android.emulation.control.SnapshotService/TrackProcess"
            ]
        },
        {
            // For tokens issued by gradle we have the following restrictions:
            "iss": "gradle-utp-emulator-control",
            // Can access the following set of methods, even if the AUD claim for
            // the given method is *NOT* present.
            //
            // Usually these are methods that do not present a significant amount
            // of danger.
            "allowed": [
                "/android.emulation.control.EmulatorController/getSensor",
                "/android.emulation.control.EmulatorController/setSensor",
                "/android.emulation.control.EmulatorController/setPhysicalModel",
                "/android.emulation.control.EmulatorController/getPhysicalModel",
                "/android.emulation.control.EmulatorController/streamPhysicalModel",
                "/android.emulation.control.EmulatorController/setBattery",
                "/android.emulation.control.EmulatorController/getBattery",
                "/android.emulation.control.EmulatorController/setGps",
                "/android.emulation.control.EmulatorController/getGps",
                "/android.emulation.control.EmulatorController/sendPhone",
                "/android.emulation.control.EmulatorController/sendSms",
                "/android.emulation.control.EmulatorController/setDisplayConfigurations",
                "/android.emulation.control.EmulatorController/getDisplayConfigurations",
                "/android.emulation.control.EmulatorController/rotateVirtualSceneCamera",
                "/android.emulation.control.EmulatorController/setVirtualSceneCameraVelocity",
                "/android.emulation.control.EmulatorController/setPosture",
                "/android.emulation.control.EmulatorController/getBrightness",
                "/android.emulation.control.EmulatorController/setBrightness"
            ],
            // Set of methods that can *ONLY* be accessed if given regex matches
            // the entry on the "aud" claim.
            "protected": [
                "/android.emulation.control.EmulatorController/getScreenshot",
                "/android.emulation.control.EmulatorController/streamScreenshot",
                // Clipboard access can be used to exchange data between the guest
                // and the host.
                "/android.emulation.control.EmulatorController/setClipboard",
                "/android.emulation.control.EmulatorController/getClipboard",
                "/android.emulation.control.EmulatorController/streamClipboard",
                // Can be used to "authenticate" with bio data.
                "/android.emulation.control.EmulatorController/sendFingerprint",
                // Touch, key and mouse can be used to manipulate device state
                "/android.emulation.control.EmulatorController/sendKey",
                "/android.emulation.control.EmulatorController/sendTouch",
                "/android.emulation.control.EmulatorController/sendMouse",
                // Could be used to trigger the assistant through "Hey Google!"
                "/android.emulation.control.EmulatorController/injectAudio",
                "/android.emulation.control.EmulatorController/streamAudio",
                "/android.emulation.control.EmulatorController/getLogcat",
                "/android.emulation.control.EmulatorController/streamLogcat",
                // Could be used to observe the device state.
                "/android.emulation.control.EmulatorController/getStatus",
                "/android.emulation.control.EmulatorController/streamNotification"
            ]
        }
    ]
}
`;

export const ENTRYPOINT_BLOB = `#!/usr/bin/env bash
set -euo pipefail

# Start pulse audio
# export PULSE_SERVER=unix:/tmp/pulse-socket
# pulseaudio -D --log-target=newfile:/tmp/pulseverbose.log --exit-idle-time=-1

# Start mitmproxy
mitmweb --set listen_port=7999 --set web_host="0.0.0.0" --set web_port=8082 --set web_open_browser=false &
sleep 3s
hashed_name=\`openssl x509 -inform PEM -subject_hash_old -in ~/.mitmproxy/mitmproxy-ca-cert.cer | head -1\`
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
`;

export const ENVOY_BLOB = `admin:
  address:
    socket_address: { address: 0.0.0.0, port_value: 8081 }

static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 8555 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                codec_type: auto
                stat_prefix: ingress_http
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/android.emulation.control.EmulatorController" }
                          route:
                            cluster: emulator_service_grpc
                            max_stream_duration:
                              grpc_timeout_header_max: 0s
                        - match: { prefix: "/android.emulation.control.Rtc" }
                          route:
                            cluster: emulator_service_grpc
                            max_stream_duration:
                              grpc_timeout_header_max: 0s
                      typed_per_filter_config:
                        envoy.filters.http.cors:
                          "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.CorsPolicy
                          allow_origin_string_match:
                            - safe_regex:
                                regex: \\*
                          allow_methods: "GET, PUT, DELETE, POST, OPTIONS"
                          allow_headers: keep-alive,user-agent,cache-control,content-type,content-transfer-encoding,x-accept-content-transfer-encoding,x-accept-response-streaming,x-user-agent,x-grpc-web,grpc-timeout
                          expose_headers: grpc-status,grpc-message
                http_filters:
                  - name: envoy.filters.http.grpc_web
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
                  - name: envoy.filters.http.cors
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.Cors
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
    - name: emulator_service_grpc
      connect_timeout: 0.25s
      type: strict_dns
      lb_policy: round_robin
      dns_lookup_family: v4_only
      http2_protocol_options: {}
      load_assignment:
        cluster_name: emulator_service_grpc_0
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: localhost
                      port_value: 8554
`;

export const NGINX_BLOB = `server {
    listen 8080;
    server_name localhost;

    location / {
        set $port 8082;
        set $server localhost;
        set $forward_scheme http;

        proxy_set_header Host localhost:$port;
        proxy_set_header Origin http://localhost:$port;
        proxy_pass $forward_scheme://$server:$port;

        expires off;
        proxy_buffering off;
        proxy_http_version 1.1;
        proxy_redirect $forward_scheme://$http_host:$port $forward_scheme://$http_host;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Cookie $http_cookie;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;
