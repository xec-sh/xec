# Use CentOS 7 image
FROM centos:7

# FIX: Change repository URLs to archive ones, as standard ones no longer work
RUN sed -i 's/mirrorlist/#mirrorlist/' /etc/yum.repos.d/CentOS-Base.repo
RUN sed -i 's|#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-Base.repo

# Update packages and install SSH server, sudo and password change utility
RUN yum update -y && \
    yum install -y openssh-server sudo passwd && \
    yum clean all

# Create user 'user'
RUN useradd --create-home --shell /bin/bash user

# Set password 'password' for user 'user'
RUN echo "password" | passwd --stdin user

# Add user 'user' to 'wheel' group, which has sudo rights
RUN usermod -aG wheel user

# Generate host keys for SSH server
RUN ssh-keygen -A

# Create necessary directory for SSH server work
RUN mkdir -p /var/run/sshd

# Expose port 22 for SSH
EXPOSE 22

# Start SSH server
CMD ["/usr/sbin/sshd", "-D"]