# Use Ubuntu as a reliable base
FROM ubuntu:latest

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    procps \
    curl \
    file \
    git \
    sudo \
    openssh-server \
    ca-certificates && \
    apt-get clean

# Create user 'user'
RUN useradd -m -s /bin/bash user
RUN echo "user:password" | chpasswd
RUN adduser user sudo

# --- FIX: Manual Brew installation from archive ---
# Create directory for installation and assign permissions
RUN mkdir -p /home/user/.user
RUN chown -R user:user /home/user/.user

# Switch to user user
USER user
WORKDIR /home/user

# Download Homebrew archive and extract it directly to the needed directory
# --strip-components=1 removes the extra root directory from the archive
RUN curl -L https://github.com/Homebrew/brew/tarball/master | tar xz --strip-components=1 -C .user

# Return to root to complete setup
USER root

# Create global script for PATH setup
# Also add path to man and info pages for completeness
RUN echo 'eval "$(/home/user/.user/bin/brew shellenv)"' > /etc/profile.d/brew.sh

# Create directory for sshd
RUN mkdir -p /var/run/sshd

# Expose port 22
EXPOSE 22

# Start SSH server
CMD ["/usr/sbin/sshd", "-D"]