#!/bin/bash
# Launch jdtls under the bundled JDK 21 (base ships only Java 17, which jdtls 1.60
# refuses), THROUGH the invisible-project proxy. This is the `jdtls` command the
# official jdtls-lsp plugin invokes, so the proxy must be inside the shim: it
# deep-merges java.import.{gradle,maven}.enabled=false into the client initialize
# (no 451-module Gradle import) and injects java.project.addToSourcePath for every
# opened file's source root, so intra-module types resolve line-exact with no
# gradle. A fixed -data workspace lets a pre-warmed invisible project persist.
export JAVA_HOME=/opt/jdk-21
export PATH="$JAVA_HOME/bin:$PATH"
exec python3 /usr/local/bin/jdtls-noimport.py \
     python3 /opt/jdtls/bin/jdtls -data "${JDTLS_DATA:-/home/bench/.jdtls-ws}" "$@"
