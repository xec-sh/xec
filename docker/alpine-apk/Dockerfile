# Use the latest official Alpine image
FROM alpine:latest

# Update cache and install OpenSSH, sudo and password shadow utility
RUN apk update && \
    apk add --no-cache openssh sudo shadow

# --- FIX ---
# Generate host keys. SSH server won't start without them.
RUN ssh-keygen -A
# --------------------

# Create user 'user'
RUN adduser -D -s /bin/sh user

# Set password 'password' for user
RUN echo "user:password" | chpasswd

# Allow wheel group to use sudo
RUN echo '%wheel ALL=(ALL) ALL' > /etc/sudoers.d/wheel

# Add user 'user' to wheel group
RUN adduser user wheel

# Create directory for sshd work
RUN mkdir -p /var/run/sshd

# Expose port 22
EXPOSE 22

# Start SSH server
CMD ["/usr/sbin/sshd", "-D"]