FROM shafiunmiraz/bitcoin:latest

# Copy bitcoin configuration
COPY bitcoin.conf /home/bitcoin/.bitcoin/bitcoin.conf

# Ensure correct permissions
RUN chown bitcoin:bitcoin /home/bitcoin/.bitcoin/bitcoin.conf && \
    chmod 600 /home/bitcoin/.bitcoin/bitcoin.conf && \
    mkdir -p /home/bitcoin/.bitcoin && \
    chown bitcoin:bitcoin /home/bitcoin/.bitcoin

# Expose Bitcoin ports
# 8333: P2P network port
# 8332: RPC port for web dashboard and API access
EXPOSE 8333 8332

# Use base image entrypoint and startup script
CMD ["bitcoind", "-conf=/home/bitcoin/.bitcoin/bitcoin.conf", "-printtoconsole"]
