FROM alpine:latest

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    g++ \
    make \
    libevent-dev \
    libsodium-dev \
    autoconf \
    git

# Clone and build mkp224o
RUN git clone https://github.com/cathugger/mkp224o.git /mkp224o && \
    cd /mkp224o && \
    ./autogen.sh && \
    ./configure && \
    make && \
    cp mkp224o /usr/local/bin/ && \
    cd / && \
    rm -rf /mkp224o

# Clean up build dependencies
RUN apk del gcc g++ make autoconf git

RUN mkdir -p /work

WORKDIR /work

# Set mkp224o as entrypoint
ENTRYPOINT ["/usr/local/bin/mkp224o"]