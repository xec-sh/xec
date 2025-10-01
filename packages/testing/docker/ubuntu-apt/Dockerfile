# Use the latest Ubuntu version as base
FROM ubuntu:latest

# Set environment variables to avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Update package list and install SSH server and sudo
RUN apt-get update && apt-get install -y openssh-server sudo

# Create user 'user' with home directory and bash shell
RUN useradd --create-home --shell /bin/bash user

# Set password 'password' for user 'user'
# In a real project, use a more secure method!
RUN echo "user:password" | chpasswd

# Add user 'user' to sudo group so they can execute commands with elevated privileges
RUN adduser user sudo

# Create necessary directory for SSH server work
RUN mkdir -p /var/run/sshd

# Expose port 22 for incoming SSH connections
EXPOSE 22

# Specify command to run when container starts: start SSH server in "non-daemon" mode
CMD ["/usr/sbin/sshd", "-D"]