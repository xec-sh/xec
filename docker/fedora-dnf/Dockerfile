# Use the latest official Fedora image
FROM fedora:latest

# Update system and install required packages
RUN dnf -y update && \
    dnf -y install openssh-server sudo passwd && \
    dnf clean all

# Create user 'user'
RUN useradd --create-home --shell /bin/bash user

# Set password 'password'. passwd in Fedora requires chpasswd.
RUN echo "user:password" | chpasswd

# Add user to 'wheel' group for sudo rights
RUN usermod -aG wheel user

# Generate host keys for SSH server
RUN ssh-keygen -A

# Expose port 22
EXPOSE 22

# Start SSH server
CMD ["/usr/sbin/sshd", "-D"]