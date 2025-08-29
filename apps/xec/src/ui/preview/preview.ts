import { aura, TextAttributes } from "@xec-sh/aura";

export function PreviewComponent() {

  return aura('box', {
    minWidth: 30,
    height: '100%',
    borderStyle: 'rounded',
    flexShrink: 1,
    flexDirection: 'column',
    border: true,
    borderColor: 'focus',
    children: [
      aura('text', {
        content: 'Hello, Aura Next!',
        fg: 'primary',
        attributes: TextAttributes.BOLD
      }),
      aura('text', {
        content: 'Hello, Aura Next! ha ha ha ha na!',
        fg: 'primary',
        attributes: TextAttributes.BOLD
      })
    ]
  })
}