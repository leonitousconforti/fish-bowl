FROM alpine:latest as dependency-preparer
ENV MITM_PROXY_VERSION="11.0.0"
ENV ENVOY_PROXY_VERSION="1.32.0"
ENV FRIDA_SERVER_VERSION="16.5.9"

WORKDIR /tmp
RUN apk add openssl wget xz tar && \
    wget "https://downloads.mitmproxy.org/${MITM_PROXY_VERSION}/mitmproxy-${MITM_PROXY_VERSION}-linux-x86_64.tar.gz" && \
    wget "https://github.com/envoyproxy/envoy/releases/download/v${ENVOY_PROXY_VERSION}/envoy-${ENVOY_PROXY_VERSION}-linux-x86_64" && \
    wget "https://github.com/frida/frida/releases/download/${FRIDA_SERVER_VERSION}/frida-server-${FRIDA_SERVER_VERSION}-android-x86_64.xz" && \
    tar -xzf "mitmproxy-${MITM_PROXY_VERSION}-linux-x86_64.tar.gz" && \
    xz --decompress "frida-server-${FRIDA_SERVER_VERSION}-android-x86_64.xz"

FROM appium/appium:latest
ENV NVIDIA_DRIVER_CAPABILITIES="compute,utility,video,display,graphics"

ENV MITM_PROXY_VERSION="11.0.0"
ENV ENVOY_PROXY_VERSION="1.32.0"
ENV FRIDA_SERVER_VERSION="16.5.9"
COPY --from=dependency-preparer "/tmp/mitmweb" "/usr/local/bin/mitmweb"
COPY --from=dependency-preparer "/tmp/mitmdump" "/usr/local/bin/mitmdump"
COPY --from=dependency-preparer "/tmp/mitmproxy" "/usr/local/bin/mitmproxy"
COPY --from=dependency-preparer "/tmp/envoy-${ENVOY_PROXY_VERSION}-linux-x86_64" "/usr/local/bin/envoy"
COPY --from=dependency-preparer "/tmp/frida-server-${FRIDA_SERVER_VERSION}-android-x86_64" "/usr/local/bin/android-frida-server"

USER root
ENV EMULATOR_API_LEVEL="30"
ENV EMULATOR_DEVICE="pixel_2"
ENV EMULATOR_SYS_IMG="x86_64"
ENV EMULATOR_IMG_TYPE="google_apis"
RUN yes | sdkmanager --licenses && \
    sdkmanager "platforms;android-${EMULATOR_API_LEVEL}" "system-images;android-${EMULATOR_API_LEVEL};${EMULATOR_IMG_TYPE};${EMULATOR_SYS_IMG}" && \
    $ANDROID_HOME/cmdline-tools/tools/bin/avdmanager create avd --name "device" --package "system-images;android-${EMULATOR_API_LEVEL};${EMULATOR_IMG_TYPE};${EMULATOR_SYS_IMG}" --device "${EMULATOR_DEVICE}" && \
    ln -s ${ANDROID_HOME}/emulator/emulator /usr/bin/

COPY entrypoint.sh /
COPY envoy.yaml /etc/envoy/envoy.yaml
COPY default.pulse-audio /etc/pulse/default.pa
COPY nginx.conf /etc/nginx/sites-enabled/default
COPY emulator_access.json /opt/android/emulator/lib/emulator_access.json
RUN chmod +x /usr/local/bin/envoy && \
    chmod +x /usr/local/bin/mitmweb && \
    chmod +x /usr/local/bin/mitmdump && \
    chmod +x /usr/local/bin/mitmproxy && \
    chmod +x /entrypoint.sh && \
    sudo apt-get update && \
    sudo apt-get install -y socat && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 5554 5555 8080 8081 8554 8555 27042
CMD ["/entrypoint.sh"]
