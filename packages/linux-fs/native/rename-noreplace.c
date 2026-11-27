#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/fs.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

/* fd 3 is inherited from the caller. Keep every operation relative to it. */
enum { DIRECTORY = 3, REJECTED = 1, NOT_SYNCED = 2, UNKNOWN = 3 };

static int fail(int outcome, int error) {
    dprintf(STDERR_FILENO, "%d\n", error);
    return outcome;
}

static int basename_ok(const char *name) {
    return *name && !strchr(name, '/') && strcmp(name, ".") && strcmp(name, "..");
}

int main(int argc, char **argv) {
    struct stat directory, source;
    if (argc != 3 || !basename_ok(argv[1]) || !basename_ok(argv[2]) || !strcmp(argv[1], argv[2]))
        return fail(REJECTED, EINVAL);
    if (fstat(DIRECTORY, &directory) < 0)
        return fail(REJECTED, errno);
    if (!S_ISDIR(directory.st_mode))
        return fail(REJECTED, ENOTDIR);
    if ((directory.st_mode & 0022) || (directory.st_uid && directory.st_uid != geteuid()))
        return fail(REJECTED, EPERM);
    int flags = fcntl(DIRECTORY, F_GETFL);
    if (flags < 0)
        return fail(REJECTED, errno);
    if (flags & O_PATH)
        return fail(REJECTED, EBADF);

    if (fstatat(DIRECTORY, argv[1], &source, AT_SYMLINK_NOFOLLOW) < 0)
        return fail(REJECTED, errno);
    if (!S_ISREG(source.st_mode) || source.st_nlink != 1)
        return fail(REJECTED, EINVAL);

    if (syscall(SYS_renameat2, DIRECTORY, argv[1], DIRECTORY, argv[2], RENAME_NOREPLACE) < 0) {
        int error = errno;
        return fail(error == EIO ? UNKNOWN : REJECTED, error);
    }
    if (fsync(DIRECTORY) < 0)
        return fail(NOT_SYNCED, errno);
    return 0;
}
