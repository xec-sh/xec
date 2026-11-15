# Changelog

## Unreleased

- Docker run-mode commands now create and own one immutable container ID before attaching. `ProcessHandle.resource` exposes that identity.
- Timeout, cancellation, `kill()` and adapter disposal await remote state verification. A failed verification remains an error with `nothrow`; a successful local transport exit alone cannot acknowledge completion.
- A reserved per-operation label supports bounded recovery after a lost create response. Cleanup verifies the label and full ID, refuses foreign/adopted resources, and reports uncertainty when creation cannot be reconciled.
- The original command timeout includes creation and execution. Cleanup shares a bounded management deadline and addresses only the owned container. `autoRemove: false` retains a confirmed stopped container; interrupted unstarted containers are removed.
- Docker exec and Kubernetes exec still own only their transports, not the existing containers. Their cancellation does not guarantee that the remote process stopped.
