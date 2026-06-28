#!/bin/bash
# Launch jdtls under the bundled JDK 21 (the base image ships only Java 17, which
# jdtls 1.60 refuses). Uses a fixed -data workspace so a pre-warmed invisible
# project persists across runs. Extra args (none expected from the plugin) pass
# through. The project under analysis is unaffected by which JDK runs the server.
export JAVA_HOME=/opt/jdk-21
export PATH="$JAVA_HOME/bin:$PATH"
exec python3 /opt/jdtls/bin/jdtls -data "${JDTLS_DATA:-/home/bench/.jdtls-ws}" "$@"
