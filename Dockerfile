
# ==============================
# Stage 1 — Build Bitcoin Core
# ==============================
FROM ubuntu:22.04 as builder

ENV DEBIAN_FRONTEND=noninteractive
ENV CAPNP_VERSION=1.0.2

# Build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    libssl-dev \
    libevent-dev \
    libboost-all-dev \
    libdb-dev \
    libdb++-dev \
    libminiupnpc-dev \
    libzmq3-dev \
    libsqlite3-dev \
    python3 \
    curl \
    ca-certificates \
    ninja-build \
    autoconf \
    automake \
    libtool \
    && rm -rf /var/lib/apt/lists/*

# Build Cap'n Proto
WORKDIR /tmp
RUN git clone --depth 1 --branch v${CAPNP_VERSION} https://github.com/capnproto/capnproto.git && \
    cd capnproto && \
    cmake -B build -S . \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/usr/local && \
    cmake --build build -j$(nproc) && \
    cmake --install build

ENV PKG_CONFIG_PATH=/usr/local/lib/pkgconfig

# Build Bitcoin Core
WORKDIR /build
COPY . .

RUN mkdir -p build && cd build && \
    cmake -DCMAKE_BUILD_TYPE=Release .. && \
    cmake --build . -j$(nproc) && \
    cmake --install . --prefix=/usr/local

# ==============================
# Stage 2 — Runtime
# ==============================
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Runtime dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    libssl-dev \
    libevent-dev \
    libboost-all-dev \
    libdb-dev \
    libdb++-dev \
    libminiupnpc-dev \
    libzmq3-dev \
    libsqlite3-dev \
    python3 \
    curl \
    ca-certificates \
    ninja-build \
    autoconf \
    automake \
    libtool \
    && rm -rf /var/lib/apt/lists/*

# Create bitcoin user
RUN useradd -m -u 1000 bitcoin

# Make sure data folder exists
RUN mkdir -p /home/bitcoin/.bitcoin && chown bitcoin:bitcoin /home/bitcoin/.bitcoin

WORKDIR /home/bitcoin

# Copy Cap'n Proto runtime libs
COPY --from=builder /usr/local/lib/libcapnp* /usr/local/lib/
COPY --from=builder /usr/local/lib/libkj* /usr/local/lib/

# Copy Bitcoin Core binaries from builder
COPY --from=builder /usr/local/bin/bitcoind /usr/local/bin/
COPY --from=builder /usr/local/bin/bitcoin-cli /usr/local/bin/

# Copy bitcoin.conf into .bitcoin
COPY bitcoin.conf /home/bitcoin/.bitcoin/bitcoin.conf
# Also copy to a backup location for the entrypoint script
COPY bitcoin.conf /etc/bitcoin.conf
RUN chown bitcoin:bitcoin /home/bitcoin/.bitcoin/bitcoin.conf

# Ensure ldconfig sees libraries
RUN ldconfig

# Ensure bitcoin user owns everything in home
RUN chown -R bitcoin:bitcoin /home/bitcoin

# Create entrypoint script to fix permissions before starting
RUN cat > /entrypoint.sh << 'EOF'
#!/bin/bash
set -e

# Ensure .bitcoin directory exists and has correct permissions
mkdir -p /home/bitcoin/.bitcoin
chmod 700 /home/bitcoin/.bitcoin

# If bitcoin.conf doesn't exist in the mounted volume, copy it from the image
if [ ! -f /home/bitcoin/.bitcoin/bitcoin.conf ]; then
    echo "bitcoin.conf not found, copying from image..."
    cp /etc/bitcoin.conf /home/bitcoin/.bitcoin/bitcoin.conf 2>/dev/null || true
fi

# Ensure correct ownership and permissions
chown -R bitcoin:bitcoin /home/bitcoin/.bitcoin
chmod 600 /home/bitcoin/.bitcoin/bitcoin.conf 2>/dev/null || true

# Switch to bitcoin user and execute the command
exec su -s /bin/bash bitcoin -c "$*"
EOF

RUN chmod +x /entrypoint.sh

ENV BITCOIN_HOME=/home/bitcoin/.bitcoin

# Expose P2P and RPC ports
EXPOSE 8333 8332

# Use entrypoint to fix permissions before running bitcoind
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bitcoind", "-conf=/home/bitcoin/.bitcoin/bitcoin.conf", "-printtoconsole"]
