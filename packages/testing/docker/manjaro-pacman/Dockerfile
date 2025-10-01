# USE MANJARO, as it supports your processor architecture
FROM manjarolinux/base:latest

# Update package database and install OpenSSH and sudo
RUN pacman -Syu --noconfirm openssh sudo

# Create user 'user', add to 'wheel' group and specify shell
RUN useradd -m -g users -G wheel -s /bin/bash user

# Set password 'password'
RUN echo "user:password" | chpasswd

# Allow users from wheel group to execute any commands via sudo
RUN echo '%wheel ALL=(ALL) ALL' >> /etc/sudoers

# Generate host keys for SSH
RUN ssh-keygen -A

# Expose port 22
EXPOSE 22

# Start SSH server
CMD ["/usr/sbin/sshd", "-D"]