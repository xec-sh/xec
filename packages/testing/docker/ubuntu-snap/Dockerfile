# Use Ubuntu 22.04, where snap works "out of the box"
FROM ubuntu:22.04

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update system and install snapd, ssh server and sudo
RUN apt-get update && apt-get install -y --no-install-recommends \
    snapd \
    openssh-server \
    sudo && \
    apt-get clean

# Create user 'user' and add to sudo group
RUN useradd -m -s /bin/bash user && \
    echo "user:password" | chpasswd && \
    adduser user sudo

# Enable SSH service so systemd starts it when container starts
RUN systemctl enable ssh.service

# Expose port 22
EXPOSE 22