import { aura, TextAttributes } from "@xec-sh/aura";

export function FilesTabComponent() {
  return aura('box', {
    width: '100%',
    height: '100%',
    children: [
      aura('text', {
        content: 'Hello, Aura Next!',
        fg: 'green',
        attributes: TextAttributes.BOLD
      }),
    ],
  });
};