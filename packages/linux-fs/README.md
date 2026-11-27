# Local Linux file publication

`@xec-sh/linux-fs` publishes a complete, previously synced file exactly when its destination name is free. Install this package on Linux x64 or arm64 for local operations that need the kernel's atomic no-replace guarantee.

```js
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { renameNoReplace } from '@xec-sh/linux-fs';

const directory = await open('/var/lib/my-app/records',
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
try {
  // This caller owns the staged name and has fsynced its complete contents.
  await renameNoReplace(directory, '.staged-record', 'record.json');
} finally {
  await directory.close();
}
```

Both arguments are distinct single path components in the open directory. Keep the handle open until the operation settles. The directory must be owned by root or the effective user and deny group/other writes. The caller owns the source name throughout the operation and is responsible for the trust of the directory it opens. The staged file must be regular with one hard link. The helper checks the source without following its final component. An existing destination of any type, including a dangling symlink, occupies its name.

Pass an optional fourth `AbortSignal` to cancel. An already aborted signal refuses the operation before it starts. Cancellation after launch waits for the helper to exit and can leave the publication outcome unknown.

On success the kernel has renamed the inode with `RENAME_NOREPLACE` and the helper has synced the directory. The published file retains one link. `RenameNoReplaceError.outcome` and `.code` distinguish these outcomes:

- `not-published` covers a confirmed refusal, including `EEXIST`, an unsupported operation, or a missing executable. Inspect an existing record to decide whether it matches the attempted operation.
- `published-not-synced` means the rename succeeded and syncing the directory failed. Its crash durability is unknown.
- `unknown` covers an interrupted or unrecognised helper result or an I/O error during the rename. Reconcile the destination with the expected inode or record before retrying.

Use a local Linux filesystem that implements no-replace rename and directory fsync. Network filesystems can report failure after a remote rename has committed. No remote executor is part of this API. A process crash before the rename can leave the staged name. A process crash after the rename leaves just the published name for that inode. Power-loss durability requires both the prior file sync and successful directory sync.

The npm archive carries both static executables. Installation does not download or compile a helper. Xec release builds use Zig 0.15.2 and the package's C source to produce them.
