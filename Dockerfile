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
    libssl3 \
    libevent-2.1-7 \
    libboost-system1.74.0 \
    libboost-filesystem1.74.0 \
    libboost-chrono1.74.0 \
    libboost-thread1.74.0 \
    libdb5.3 \
    libdb5.3++ \
    libminiupnpc17 \
    libzmq5 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create bitcoin user
RUN useradd -m -u 1000 bitcoin

WORKDIR /home/bitcoin

# Copy Cap'n Proto runtime libs
COPY --from=builder /usr/local/lib/libcapnp* /usr/local/lib/
COPY --from=builder /usr/local/lib/libkj* /usr/local/lib/
RUN ldconfig

# Bitcoin Core binaries are already installed in /usr/local/bin
# No need to copy manually

RUN chown -R bitcoin:bitcoin /home/bitcoin

USER bitcoin

ENV BITCOIN_HOME=/home/bitcoin/.bitcoin

# Expose ports
EXPOSE 8333 8332

# Default command
CMD ["bitcoind", "-conf=/home/bitcoin/.bitcoin/bitcoin.conf", "-printtoconsole"]
