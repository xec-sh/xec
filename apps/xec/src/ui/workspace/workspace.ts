import { aura } from "@xec-sh/aura";

export function WorkspaceComponent() {
  return aura('box', {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    children: [
    ],
  });
}