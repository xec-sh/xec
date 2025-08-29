import { aura, TextAttributes } from "@xec-sh/aura";

export function MainComponent() {

  return aura('group', {
    width: '100%',
    height: '100%',
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
    children: [
      aura('box', {
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
      }),
      aura('group', {
        width: '100%',
        height: 12,
        flexDirection: 'row',
        children: [
          aura('box', {
            width: 'auto',
            height: '100%',
            borderStyle: 'rounded',
            flexGrow: 1,
            flexShrink: 1,
            flexDirection: 'column',
            border: true,
            borderColor: 'border',
          }),
          aura('box', {
            width: 'auto',
            height: '100%',
            borderStyle: 'rounded',
            flexGrow: 1,
            flexShrink: 1,
            flexDirection: 'column',
            border: true,
            borderColor: 'border',
          }),
          aura('box', {
            width: 'auto',
            height: '100%',
            borderStyle: 'rounded',
            flexGrow: 1,
            flexShrink: 1,
            flexDirection: 'column',
            border: true,
            borderColor: 'border',
          })
        ]
      }),
    ]
  });
}